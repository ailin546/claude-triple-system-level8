# Background Jobs & Queues

## Simple Queue Pattern

Non-blocking job processing via an in-memory queue:

```typescript
class JobQueue<T> {
  private queue: T[] = []
  private processing = false

  async add(job: T): Promise<void> {
    this.queue.push(job)
    if (!this.processing) this.process()
  }

  private async process(): Promise<void> {
    this.processing = true
    while (this.queue.length > 0) {
      const job = this.queue.shift()!
      try {
        await this.execute(job)
      } catch (error) {
        console.error('Job failed:', error)
      }
    }
    this.processing = false
  }

  private async execute(job: T): Promise<void> {
    // Job execution logic
  }
}

interface IndexJob { marketId: string }
const indexQueue = new JobQueue<IndexJob>()

export async function POST(request: Request) {
  const { marketId } = await request.json()
  await indexQueue.add({ marketId })
  return NextResponse.json({ success: true, message: 'Job queued' })
}
```

> For production workloads, replace the in-memory queue with a durable queue
> (BullMQ + Redis, AWS SQS, etc.) to survive restarts and support retries.
