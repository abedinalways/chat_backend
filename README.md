# 💬 Real-Time Chat Backend

A real-time messaging backend built with **NestJS**, **Socket.IO**, **PostgreSQL**, and **Prisma ORM**. Supports instant messaging, typing indicators, read receipts, and push notifications via WebSocket.

---

## 📦 Tech Stack

| Technology  | Purpose                        |
|-------------|--------------------------------|
| NestJS 11   | Backend framework (REST + WS)  |
| Socket.IO 4 | Real-time WebSocket comms      |
| PostgreSQL  | Database                       |
| Prisma 7    | ORM + migrations               |
| JWT         | Authentication                 |
| class-validator | Input validation          |

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js v18+
- PostgreSQL running locally
- npm / yarn / pnpm

### 2. Clone & Install

```bash
git clone <repo-url>
cd chat-backend
npm install
```

### 3. Configure Environment
 
 Copy `.env.example` to `.env` and update values:
 
 ```bash
 cp .env.example .env
 ```
 
 Then edit `.env` file:
 
 ```env
 DATABASE_URL="postgresql://postgres:password@localhost:5432/chat_db?schema=public"
 JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
 JWT_EXPIRES_IN="7d"
 PORT=5000
 NODE_ENV="development"
 ```
 
 **⚠️ Important:** `JWT_SECRET` is a required environment variable. The application will throw an error on startup if it's not set.

### 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migration to create tables
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to see data
npx prisma studio
```

### 5. Start Server

```bash
# Development mode (watch mode)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

Server will start at **http://localhost:3001** and WebSocket at **ws://localhost:3001/chat**

---

## 📁 Project Structure

```
src/
├── main.ts                     # Entry point - CORS, ValidationPipe
├── app.module.ts               # Root module
├── prisma/
│   ├── prisma.module.ts        # Global Prisma module
│   └── prisma.service.ts       # PrismaClient wrapper
├── auth/
│   ├── auth.module.ts          # JWT auth module
│   ├── controllers/
│   │   └── auth.controller.ts  # POST /auth/register, /auth/login
│   ├── services/
│   │   └── auth.service.ts     # User registration & login logic
│   ├── strategies/
│   │   └── jwt.strategy.ts     # Passport JWT strategy
│   ├── guards/
│   │   └── jwt-auth.guard.ts   # JWT auth guard
│   ├── decorators/
│   │   └── user.decorator.ts   # @User() param decorator
│   └── interfaces/
│       └── jwt-payload.interface.ts
└── messaging/
    ├── messaging.module.ts
    ├── gateways/
    │   └── messaging.gateway.ts     # WebSocket gateway (/chat)
    ├── controllers/
    │   └── messaging.controller.ts  # REST endpoints (/chat)
    ├── services/
    │   ├── message.service.ts       # Message CRUD + conversations
    │   └── notification.service.ts  # Notifications CRUD
    ├── interfaces/
    │   └── message.interface.ts     # IMessage, IConversation, enums
    ├── dto/
    │   ├── send-message.dto.ts
    │   ├── create-conversation.dto.ts
    │   └── mark-read.dto.ts
    └── constants/
        └── socket.constants.ts      # WebSocket event names
```

---

## 🔌 API Reference

### Auth

All auth endpoints are **public** (no token required).

#### `POST /auth/register`
Create a new user account.

```json
// Request
{ "email": "user@example.com", "name": "John Doe" }

// Response 201
{
  "id": "clx...",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2026-07-26T..."
}
```

#### `POST /auth/login`
Login with email. Returns JWT token.

```json
// Request
{ "email": "user@example.com" }

// Response 200
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": null
  }
}
```

### Chat (requires JWT)

**Header:** `Authorization: Bearer <token>`

#### `GET /chat/conversations`
Get all conversations for the authenticated user.

```
Response 200
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "participants": ["user1", "user2"],
      "lastMessage": { ... },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

#### `POST /chat/conversations`
Create a new conversation.

```json
// Request
{ "participantIds": ["userid1", "userid2"] }

// Response 200
{ "success": true, "data": { "id": "clx...", "participants": [...], ... } }
```

#### `GET /chat/conversations/:id`
Get a single conversation by ID.

#### `GET /chat/messages?conversationId=xxx&limit=50&offset=0`
Get paginated messages for a conversation.

#### `POST /chat/messages`
Send a new message.

```json
// Request
{
  "conversationId": "clx...",
  "content": "Hello!",
  "receiverId": "userid2"    // optional
}

// Response 200
{ "success": true, "data": { "id": "clx...", "content": "Hello!", ... } }
```

➡️ Also **broadcasts** the message in real-time via WebSocket to all conversation participants.

#### `GET /chat/messages/:id`
Get a single message by ID.

#### `POST /chat/messages/:messageId/read`
Mark a message as read.

#### `DELETE /chat/messages/:id`
Delete your own message.

#### `GET /chat/notifications?limit=50&offset=0`
Get notifications for the authenticated user.

#### `GET /chat/notifications/unread-count`
Get the count of unread notifications.

```json
// Response
{ "success": true, "data": { "count": 3 } }
```

#### `POST /chat/notifications/:id/read`
Mark a specific notification as read.

#### `POST /chat/notifications/read-all`
Mark all notifications as read.

#### `DELETE /chat/notifications/:id`
Delete a notification.

---

## 🔌 WebSocket Events

Connect to: **`ws://localhost:3001/chat`**

### Authentication
Pass JWT token via auth or headers:

```js
// Option 1: auth
const socket = io("ws://localhost:3001/chat", {
  auth: { token: "Bearer <jwt_token>" }
});

// Option 2: header (not supported in browser, use auth)
const socket = io("ws://localhost:3001/chat", {
  extraHeaders: { Authorization: "Bearer <jwt_token>" }
});
```

### Client → Server Events

| Event              | Payload                                          | Description              |
|--------------------|--------------------------------------------------|--------------------------|
| `send_message`     | `{ conversationId, content, receiverId?, type? }` | Send a message           |
| `typing`           | `{ conversationId, isTyping }`                   | Typing indicator         |
| `mark_as_read`     | `{ messageId }`                                  | Mark message as read     |
| `join_conversation`| `{ conversationId }`                              | Join a conversation room |
| `leave_conversation`| `{ conversationId }`                             | Leave a conversation room|

### Server → Client Events

| Event             | Payload                                      | Description                |
|-------------------|----------------------------------------------|----------------------------|
| `new_message`     | `{ id, content, senderId, ... }`            | New message received       |
| `typing_update`   | `{ userId, conversationId, isTyping }`      | Someone is typing          |
| `message_read`    | `{ messageId, userId }`                     | Message read receipt       |
| `user_connected`  | `{ userId, socketId }`                      | User came online           |
| `notification`    | `{ type, data }`                            | New notification           |
| `error`           | `{ message }`                               | Error response             |

### WebSocket Flow Example (Sending a Message)

```
Client A                     Server                    Client B
   |                           |                          |
   |-- send_message ---------->|                          |
   |                           |-- save to DB ----------->|
   |                           |                          |
   |<-- message_sent ----------|                          |
   |                           |                          |
   |                           |-- new_message ---------->|
   |                           |                          |
   |                           |-- notification --------->| (if receiverId set)
```

---

## 💾 Database Schema (Prisma)

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  avatar    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Conversation {
  id           String   @id @default(cuid())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  participants ConversationParticipant[]
  messages     Message[]
}

model Message {
  id             String        @id @default(cuid())
  content        String
  type           MessageType   @default(TEXT)
  status         MessageStatus @default(SENT)
  senderId       String
  receiverId     String?
  conversationId String
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  title     String
  message   String
  type      NotificationType @default(SYSTEM)
  read      Boolean          @default(false)
  data      Json?
  createdAt DateTime         @default(now())
}
```

**Enums:** `MessageType` (TEXT, IMAGE, FILE, SYSTEM) | `MessageStatus` (SENT, DELIVERED, READ, FAILED) | `NotificationType` (MESSAGE, FRIEND_REQUEST, SYSTEM, MENTION)

---

## 🧪 Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

---

## 🛠️ Common Scripts

| Command                    | Description              |
|----------------------------|--------------------------|
| `npm run start:dev`        | Start in watch mode      |
| `npm run build`            | Build for production     |
| `npm run start:prod`       | Start production server  |
| `npm test`                 | Run unit tests           |
| `npm run lint`             | Lint + auto-fix          |
| `npx prisma studio`        | Open database GUI        |
| `npx prisma migrate dev`   | Create new migration     |

---

## 📝 License

MIT