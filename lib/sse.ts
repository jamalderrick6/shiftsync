// Simple SSE event bus
type SSEClient = {
  userId: string
  send: (data: string) => void
}

const clients = new Map<string, Set<SSEClient>>()

export function addClient(userId: string, client: SSEClient) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set())
  }
  clients.get(userId)!.add(client)
}

export function removeClient(userId: string, client: SSEClient) {
  const userClients = clients.get(userId)
  if (userClients) {
    userClients.delete(client)
    if (userClients.size === 0) {
      clients.delete(userId)
    }
  }
}

export function emitToUser(userId: string, event: Record<string, unknown>) {
  const userClients = clients.get(userId)
  if (!userClients) return

  const data = `data: ${JSON.stringify(event)}\n\n`
  Array.from(userClients).forEach((client) => {
    try {
      client.send(data)
    } catch {
      userClients.delete(client)
    }
  })
}

export function emitToAll(event: Record<string, unknown>) {
  const data = `data: ${JSON.stringify(event)}\n\n`
  Array.from(clients.entries()).forEach(([, userClients]) => {
    Array.from(userClients).forEach((client) => {
      try {
        client.send(data)
      } catch {
        userClients.delete(client)
      }
    })
  })
}
