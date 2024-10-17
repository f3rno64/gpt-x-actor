// TODO: Refactor

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import OpenAI from 'openai'
import PI from 'p-iteration'
import Handlebars from 'handlebars'
import signale from 'signale'
import _chunk from 'lodash/chunk'
import _sum from 'lodash/sum'
import { z } from 'zod'
import { zodResponseFormat } from 'openai/helpers/zod'
import readline from 'readline'

const exec = require('child_process').exec

export const { NODE_ENV = 'development' } = process.env
export const MAX_PROMPT_LENGTH = 30_000
export const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const DB_FN = process.env['DB_FN'] || `db-${NODE_ENV}.json`
const dbFilePath = path.join(__dirname, '../data', DB_FN)

export const asyncWithRetry = async <T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let attempt = 0

  while (attempt < retries) {
    try {
      return await fn()
    } catch (error) {
      attempt++
      if (attempt >= retries) {
        throw error
      }
      await new Promise((resolve) =>
        setTimeout(resolve, delay * Math.pow(2, attempt))
      )
    }
  }

  throw new Error('Max retries reached')
}
export const loadDB = (): any => {
  if (fs.existsSync(dbFilePath)) {
    const data = fs.readFileSync(dbFilePath, 'utf-8')
    return JSON.parse(data)
  }
  return {}
}

export const saveDB = (data: any): void => {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2))
  signale.success(`Database saved to ${dbFilePath}`)
}

export const hashContent = (content: string): string => {
  return crypto.createHash('sha256').update(content).digest('hex')
}

export const promptUser = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(`${query}\n> `, resolve))
}

export const getFilePaths = (dir: string, extensions: string[]): string[] => {
  let results: string[] = []
  const list: string[] = fs.readdirSync(dir)
  list.forEach((file: string) => {
    const filePath: string = path.resolve(dir, file)
    const stat: fs.Stats = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilePaths(filePath, extensions))
    } else if (extensions.includes(path.extname(filePath))) {
      results.push(filePath)
    }
  })
  return results
}

export const client: OpenAI = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'] // This is the default and can be omitted
})

export const callOpenAiApi = async (
  prompt: string,
  model: string = 'gpt-4o'
): Promise<string> => {
  const startTime = Date.now()
  const completion: OpenAI.Chat.Completions.ChatCompletion =
    await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model
    })
  const endTime = Date.now()
  const duration = (endTime - startTime) / 1000 // duration in seconds

  const tokensUsed = completion.usage?.total_tokens ?? 0
  const cost = (tokensUsed / 1_000_000) * 0.006 // $0.006 per token

  signale.info(
    `Completion cost: $${cost.toFixed(6)} for ${tokensUsed} tokens in ${duration.toFixed(2)} seconds`
  )

  return completion.choices[0].message.content ?? ''
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const AutoStep = z.union([
  z.object({
    type: z.literal('CREATE_FILE'),
    filePath: z.string(),
    fileContents: z.string()
  }),
  z.object({
    type: z.literal('CREATE_DIR'),
    dirPath: z.string()
  }),
  z.object({
    type: z.literal('EDIT_FILE'),
    filePath: z.string(),
    fileContents: z.string()
  }),
  z.object({
    type: z.literal('DELETE_FILE'),
    filePath: z.string()
  }),
  z.object({
    type: z.literal('REQUEST_FILE'),
    filePath: z.string()
  }),
  z.object({
    type: z.literal('QUERY_USER'),
    message: z.string()
  }),
  z.object({
    type: z.literal('RUN_SHELL'),
    cwd: z.string(),
    command: z.string()
  }),
  z.object({
    type: z.literal('DONE')
  })
])

export type AutoStep = z.infer<typeof AutoStep>
export const AutoSteps = z.object({
  steps: z.array(AutoStep)
})

export type AutoSteps = z.infer<typeof AutoSteps>

export const callOpenAiApiStructured = async <T>(
  messages: OpenAIMessage[],
  model: string = 'gpt-4o',
  responseType: any,
  responseTypeName: string
): Promise<T> => {
  const completion = await client.beta.chat.completions.parse({
    model,
    messages,
    response_format: zodResponseFormat(responseType, responseTypeName)
  })

  return completion.choices[0].message.parsed ?? ''
}

export const handleAutoSteps = async (
  autoSteps: AutoSteps
): Promise<OpenAIMessage[]> => {
  const responses: OpenAIMessage[] = []

  for (const step of autoSteps.steps) {
    switch (step.type) {
      case 'CREATE_FILE':
        await handleCreateFile(step.filePath, step.fileContents)
        break
      case 'CREATE_DIR':
        await handleCreateDir(step.dirPath)
        break
      case 'EDIT_FILE':
        await handleEditFile(step.filePath, step.fileContents)
        break
      case 'DELETE_FILE':
        await handleDeleteFile(step.filePath)
        break
      case 'REQUEST_FILE':
        responses.push({
          role: 'user',
          content: await handleRequestFile(step.filePath)
        })
        break
      case 'QUERY_USER':
        responses.push({
          role: 'user',
          content: await handleQueryUser(step.message)
        })
        break
      case 'RUN_SHELL':
        responses.push({
          role: 'user',
          content: await handleQueryRunShell(step.cwd, step.command)
        })
        break
      case 'DONE':
        signale.success('All steps completed.')
        process.exit(0)
        break
      default:
        signale.warn(`Unknown step type: ${(step as any).type}`)
    }
  }

  return responses
}

const handleCreateFile = async (
  filePath: string,
  fileContents: string
): Promise<string> => {
  const confirmation = await handleQueryUser(
    `Do you want to create the file at ${filePath}?\n\n${fileContents}\n\n(yes/no)`
  )
  if (confirmation.toLowerCase() === 'yes') {
    fs.writeFileSync(filePath, fileContents)
    signale.success(`File created: ${filePath}`)
    return JSON.stringify({ success: `File created: ${filePath}` })
  } else {
    signale.info(`File creation aborted: ${filePath}`)
    return JSON.stringify({ error: `File creation aborted: ${filePath}` })
  }
}

const handleCreateDir = async (dirPath: string): Promise<string> => {
  const confirmation = await handleQueryUser(
    `Do you want to create the directory at ${dirPath}? (yes/no)`
  )
  if (confirmation.toLowerCase() === 'yes') {
    fs.mkdirSync(dirPath, { recursive: true })
    signale.success(`Directory created: ${dirPath}`)
    return JSON.stringify({ success: `Directory created: ${dirPath}` })
  } else {
    signale.info(`Directory creation aborted: ${dirPath}`)
    return JSON.stringify({ error: `Directory creation aborted: ${dirPath}` })
  }
}

const handleEditFile = async (
  filePath: string,
  fileContents: string
): Promise<string> => {
  const confirmation = await handleQueryUser(
    `Do you want to edit the file at ${filePath}?\n\n${fileContents}\n\n(yes/no)`
  )
  if (confirmation.toLowerCase() === 'yes') {
    fs.writeFileSync(filePath, fileContents)
    signale.success(`File edited: ${filePath}`)
    return JSON.stringify({ success: `File edited: ${filePath}` })
  } else {
    return JSON.stringify({ error: `File edit aborted: ${filePath}` })
  }
}

const handleDeleteFile = async (filePath: string): Promise<string> => {
  const confirmation = await handleQueryUser(
    `Do you want to delete the file at ${filePath}? (yes/no)`
  )
  if (confirmation.toLowerCase() === 'yes') {
    fs.unlinkSync(filePath)
    signale.success(`File deleted: ${filePath}`)
    return JSON.stringify({ success: `File deleted: ${filePath}` })
  } else {
    signale.info(`File deletion aborted: ${filePath}`)
    return JSON.stringify({ error: `File deletion aborted: ${filePath}` })
  }
}

const handleRequestFile = async (filePath: string): Promise<string> => {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  signale.info(`File requested: ${filePath}\nContent:\n${fileContent}`)

  return JSON.stringify({
    filePath,
    fileContent
  })
}

const handleQueryUser = async (message: string): Promise<string> => {
  return new Promise((resolve) => {
    process.stdout.write(`${message}\n> `)
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim())
    })
  })
}

const handleQueryRunShell = async (
  cwd: string,
  command: string
): Promise<string> => {
  const confirmation = await handleQueryUser(
    `Do you want to run the command in ${cwd}?\n\n${command}\n\n(yes/no)`
  )
  if (confirmation.toLowerCase() === 'yes') {
    return new Promise((resolve) => {
      exec(command, { cwd }, (error: any, stdout: string, stderr: string) => {
        if (error) {
          signale.error(`Error executing command: ${error.message}`)
          resolve(
            JSON.stringify({
              errorMessage: error.message,
              errorStack: error.stack
            })
          )
        } else {
          signale.success(`Command executed successfully: ${command}`)
          resolve(JSON.stringify({ stdout, stderr }))
        }
      })
    })
  } else {
    signale.info(`Command execution aborted: ${command}`)
    return JSON.stringify({ error: `Command execution aborted: ${command}` })
  }
}

export const loadTemplate = (
  templateName: string
): Handlebars.TemplateDelegate => {
  const templatePath: string = path.join(
    __dirname,
    '../',
    'templates',
    templateName
  )
  const templateContent: string = fs.readFileSync(templatePath, 'utf-8')
  return Handlebars.compile(templateContent)
}

export const getCachedResponseKey = (
  templateContent: string,
  args: object,
  model: string,
  messages?: OpenAIMessage[]
): string => {
  const hash: string = hashContent(
    JSON.stringify({
      args,
      model,
      templateContent,
      messages: messages ?? []
    })
  )

  return `${hash}.response`
}

export const getCachedResponse = (
  templateContent: string,
  args: object,
  model: string,
  messages?: OpenAIMessage[]
): string | null => {
  const responseFileName: string = getCachedResponseKey(
    templateContent,
    args,
    model,
    messages
  )
  const responseFilePath: string = path.join(dataDir, responseFileName)

  if (fs.existsSync(responseFilePath)) {
    signale.info(`read ${responseFilePath}`)
    return fs.readFileSync(responseFilePath, 'utf-8')
  }

  return null
}

export const cacheResponse = (
  template: any,
  args: object,
  response: string,
  model: string,
  messages?: OpenAIMessage[]
): void => {
  const responseFileName: string = getCachedResponseKey(
    template.toString(),
    args,
    model,
    messages
  )
  const responseFilePath: string = path.join(dataDir, responseFileName)
  fs.writeFileSync(responseFilePath, response)
  signale.info(`wrote ${responseFilePath}`)

  const queryFilePath: string = responseFilePath.replace('.response', '.query')
  const renderedTemplate: string = template(args)
  fs.writeFileSync(queryFilePath, renderedTemplate)
  signale.info(`wrote ${queryFilePath}`)
}

export const getResponse = async (
  template: any,
  args: object,
  model: string
): Promise<string> => {
  const cachedResponse: string | null = getCachedResponse(
    template.toString(),
    args,
    model
  )

  if (cachedResponse) {
    return cachedResponse
  }

  const prompt: string = template(args)
  signale.info(`Querying ${model}...`)
  const response: string = await callOpenAiApi(prompt, model)
  cacheResponse(template, args, response, model)
  return response
}

export const getResponseStructured = async <T>(
  messages: OpenAIMessage[],
  model: string,
  responseType: any,
  responseTypeName: string
): Promise<T> => {
  signale.info(`Querying ${model}...`)

  const response: T = await callOpenAiApiStructured<T>(
    messages,
    model,
    responseType,
    responseTypeName
  )

  return response
}

export const dataDir: string = `${__dirname}/../cache`

export const summariseDeep = async (
  filePaths: string[],
  outPath: string
): Promise<void> => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir)
    signale.info(`Created cache directory at ${dataDir}`)
  }

  const summariseTemplate: Handlebars.TemplateDelegate =
    loadTemplate('summarise-file.hbs')
  const summariseSummariesTemplate: Handlebars.TemplateDelegate = loadTemplate(
    'summarise-summaries.hbs'
  )
  const summariseMetaSummariesTemplate: Handlebars.TemplateDelegate =
    loadTemplate('summarise-meta-summaries.hbs')
  const summaries: any[] = []

  for (const filePath of filePaths) {
    const fileContent: string = fs.readFileSync(filePath, 'utf-8')
    const summary = await getResponse(
      summariseTemplate,
      { filePath, fileContent },
      'gpt-4o-mini'
    )

    summaries.push({ filePath, summary })
  }

  const chunks: any[] = []
  let currentChunk: any[] = []

  for (const summary of summaries) {
    const renderedPrompt = summariseSummariesTemplate({
      summaries: [...currentChunk, summary]
    })

    if (renderedPrompt.length <= MAX_PROMPT_LENGTH) {
      currentChunk.push(summary)
    } else {
      chunks.push(currentChunk)
      currentChunk = [summary]
    }
  }

  chunks.push(currentChunk)

  const metaSummaries = await PI.mapSeries(
    chunks,
    async (summaries: any[]): Promise<string> =>
      await getResponse(summariseSummariesTemplate, { summaries }, 'gpt-4o')
  )

  if (metaSummaries.length === 1) {
    fs.writeFileSync(outPath, metaSummaries[0])
    return
  }

  const metaMetaSummary = await getResponse(
    summariseMetaSummariesTemplate,
    { metaSummaries },
    'gpt-4o'
  )

  fs.writeFileSync(outPath, metaMetaSummary)
}
