# Node.js PostgreSQL Authentication API

A secure REST API with user authentication using Node.js, Express, PostgreSQL, and JWT.

## Features

- User registration with secure password hashing (bcrypt)
- User login with JWT token generation
- Protected routes with JWT middleware
- PostgreSQL database integration
- Input validation and error handling

## Project Structure

\`\`\`
├── server.js              # Main entry point
├── config/
│   └── db.js              # Database connection configuration
├── controllers/
│   └── authController.js  # Authentication logic
├── middleware/
│   └── authMiddleware.js  # JWT protection middleware
├── models/
│   └── user.js            # User model and database operations
├── routes/
│   └── authRoutes.js      # API route definitions
├── scripts/
│   └── setup-database.sql # Database setup script
├── .env.example           # Environment variables template
└── package.json
\`\`\`

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)

## Setup Instructions

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Setup PostgreSQL Database

Create a new database:

\`\`\`bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE auth_db;

# Exit
\q
\`\`\`

Run the setup script:

\`\`\`bash
psql -U postgres -d auth_db -f scripts/setup-database.sql
\`\`\`

### 3. Configure Environment Variables

Copy the example environment file:

\`\`\`bash
cp .env.example .env
\`\`\`

Update `.env` with your database credentials:

\`\`\`
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=auth_db
DB_USER=postgres
DB_PASSWORD=your_password_here
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
\`\`\`

### 4. Start the Server

Development mode (with auto-reload):

\`\`\`bash
npm run dev
\`\`\`

Production mode:

\`\`\`bash
npm start
\`\`\`

## API Endpoints

### Public Routes

#### Register User

\`\`\`http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securepassword123"
}
\`\`\`

Response:

\`\`\`json
{
  "message": "User registered successfully",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "created_at": "2024-01-15T10:30:00.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
\`\`\`

#### Login User

\`\`\`http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
\`\`\`

Response:

\`\`\`json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
\`\`\`

### Protected Routes

#### Get User Profile

\`\`\`http
GET /api/auth/profile
Authorization: Bearer <your_jwt_token>
\`\`\`

Response:

\`\`\`json
{
  "user": {
    "id": 1,
    "username": "johndoe",
    "email": "john@example.com",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
\`\`\`

## Error Responses

### Validation Error (400)

\`\`\`json
{
  "error": "Validation error",
  "message": "Username, email, and password are required"
}
\`\`\`

### Duplicate User (409)

\`\`\`json
{
  "error": "Duplicate entry",
  "message": "A user with this email already exists"
}
\`\`\`

### Invalid Credentials (401)

\`\`\`json
{
  "error": "Authentication failed",
  "message": "Invalid email or password"
}
\`\`\`

### Unauthorized (401)

\`\`\`json
{
  "error": "Unauthorized",
  "message": "Access token is required"
}
\`\`\`

## Testing with cURL

Register a new user:

\`\`\`bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com","password":"password123"}'
\`\`\`

Login:

\`\`\`bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
\`\`\`

Get profile (protected):

\`\`\`bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
\`\`\`

## Security Notes

- Always use a strong, unique JWT_SECRET in production
- Passwords are hashed using bcrypt with 10 salt rounds
- JWT tokens expire after 24 hours by default
- Never commit `.env` files to version control
