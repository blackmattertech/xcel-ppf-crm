/**
 * Redis Queue System
 * 
 * Background job queue for async processing:
 * - Email sending
 * - Webhook processing
 * - Heavy analytics
 * - Bulk operations
 * 
 * Uses BullMQ for reliable job processing
 * Jobs are processed asynchronously without blocking API responses
 */

import { Queue, Worker, Job } from 'bullmq'
import { getRedisClient } from './redis'

// Queue instances cache
const queues: Map<string, Queue> = new Map()
const workers: Map<string, Worker> = new Map()

/**
 * Queue names
 */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  WEBHOOK: 'webhook',
  ANALYTICS: 'analytics',
  BULK_OPERATIONS: 'bulk',
} as const

/**
 * Get or create a queue instance
 */
function getQueue(name: string): Queue | null {
  // Return cached queue if exists
  if (queues.has(name)) {
    return queues.get(name)!
  }

  const client = getRedisClient()
  if (!client) {
    // Redis unavailable - return null (graceful degradation)
    console.warn(`[Queue] Redis unavailable, queue "${name}" operations will be skipped`)
    return null
  }

  try {
    // Create new queue
    const queue = new Queue(name, {
      connection: client as any, // BullMQ expects Redis-like interface
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed jobs
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
    })

    queues.set(name, queue)
    return queue
  } catch (error) {
    console.error(`[Queue] Failed to create queue "${name}":`, error)
    return null
  }
}

/**
 * Add job to queue
 * Returns immediately without waiting for processing
 */
export async function addJob<T = any>(
  queueName: string,
  jobData: T,
  options?: {
    priority?: number
    delay?: number // Delay in milliseconds
    jobId?: string
  }
): Promise<string | null> {
  const queue = getQueue(queueName)
  
  if (!queue) {
    // Redis unavailable - log and return null
    console.warn(`[Queue] Cannot add job to "${queueName}" - Redis unavailable`)
    return null
  }

  try {
    const job = await queue.add(
      'default',
      jobData,
      {
        priority: options?.priority,
        delay: options?.delay,
        jobId: options?.jobId,
      }
    )

    logQueue('added', queueName, job.id!)
    return job.id!
  } catch (error) {
    console.error(`[Queue] Error adding job to "${queueName}":`, error)
    return null
  }
}

/**
 * Create a worker to process jobs
 * 
 * Example:
 *   createWorker(QUEUE_NAMES.EMAIL, async (job) => {
 *     await sendEmail(job.data)
 *   })
 */
export function createWorker<T = any>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: {
    concurrency?: number // Number of jobs to process concurrently
  }
): Worker | null {
  // Return existing worker if exists
  if (workers.has(queueName)) {
    return workers.get(queueName)!
  }

  const client = getRedisClient()
  if (!client) {
    console.warn(`[Queue] Cannot create worker for "${queueName}" - Redis unavailable`)
    return null
  }

  try {
    const worker = new Worker(
      queueName,
      async (job: Job<T>) => {
        logQueue('processing', queueName, job.id!)
        try {
          await processor(job)
          logQueue('completed', queueName, job.id!)
        } catch (error) {
          logQueue('failed', queueName, job.id!, error)
          throw error // Re-throw to let BullMQ handle retries
        }
      },
      {
        connection: client as any,
        concurrency: options?.concurrency || 1,
        limiter: {
          max: 10, // Max 10 jobs per interval
          duration: 1000, // Per second
        },
      }
    )

    worker.on('completed', (job) => {
      logQueue('completed', queueName, job.id!)
    })

    worker.on('failed', (job, err) => {
      logQueue('failed', queueName, job?.id || 'unknown', err)
    })

    workers.set(queueName, worker)
    return worker
  } catch (error) {
    console.error(`[Queue] Failed to create worker for "${queueName}":`, error)
    return null
  }
}

/**
 * Get job status
 */
export async function getJobStatus(
  queueName: string,
  jobId: string
): Promise<{
  id: string
  state: string
  progress: number
  data: any
} | null> {
  const queue = getQueue(queueName)
  if (!queue) return null

  try {
    const job = await queue.getJob(jobId)
    if (!job) return null

    const state = await job.getState()
    
    // Handle progress which can be number, string, object, or boolean
    let progress = 0
    if (typeof job.progress === 'number') {
      progress = job.progress
    } else if (typeof job.progress === 'string') {
      const parsed = parseFloat(job.progress)
      progress = isNaN(parsed) ? 0 : parsed
    }
    
    return {
      id: job.id!,
      state,
      progress,
      data: job.data,
    }
  } catch (error) {
    console.error(`[Queue] Error getting job status:`, error)
    return null
  }
}

/**
 * Cleanup queues and workers
 * Useful for graceful shutdown
 */
export async function closeQueues(): Promise<void> {
  // Close all workers
  for (const [name, worker] of workers.entries()) {
    try {
      await worker.close()
    } catch (error) {
      console.warn(`[Queue] Error closing worker "${name}":`, error)
    }
  }
  workers.clear()

  // Close all queues
  for (const [name, queue] of queues.entries()) {
    try {
      await queue.close()
    } catch (error) {
      console.warn(`[Queue] Error closing queue "${name}":`, error)
    }
  }
  queues.clear()
}

/**
 * Performance logging
 */
function logQueue(
  action: 'added' | 'processing' | 'completed' | 'failed',
  queueName: string,
  jobId: string,
  error?: any
): void {
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_QUEUE_LOGS === 'true') {
    if (action === 'failed') {
      console.error(`[Queue ${action.toUpperCase()}] ${queueName}:${jobId}`, error)
    } else {
      console.log(`[Queue ${action.toUpperCase()}] ${queueName}:${jobId}`)
    }
  }
}
