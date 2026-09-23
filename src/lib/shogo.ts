import { createClient } from '@shogo-ai/sdk'
import { prisma } from './db'

export const shogo = createClient({
  apiUrl: process.env.SHOGO_API_URL!,
  projectId: process.env.PROJECT_ID!,
  db: prisma,
})
