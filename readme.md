# Shared Expenses APP API

## TODO

- [ ] Add notifications preferences to users  

## Endpoints

### Users

- **POST** `/register`: Create a user account
- **POST** `/login`: Log in and receive a JWT token
- **GET** `/profile`: Retrieve profile information (authenticated)
- **PUT** `/profile`: Update profile information (authenticated)

### Groups/Tricounts

- **POST** `/groups`: Create a group
- **GET** `/groups`: List all groups of the connected user
- **GET** `/groups/{id}`: Display details of a group
- **PUT** `/groups/{id}`: Update a group
- **DELETE** `/groups/{id}`: Delete a group
- **POST** `/groups/{joinCode}/join`: Join a group
- **POST** `/groups/{id}/leave`: Leave a group

### Expenses

- **POST** `/groups/{groupId}/expenses`: Add an expense to a group
- **GET** `/groups/{groupId}/expenses`: Retrieve the expense summary of a group
- **GET** `/groups/{groupId}/expenses/{expenseId}`: View details of a specific expense
- **PUT** `/groups/{groupId}/expenses/{expenseId}`: Update an expense
- **DELETE** `/groups/{groupId}/expenses/{expenseId}`: Delete an expense

### Image Upload

- **POST** `/upload/profile`: Upload a profile image
- **POST** `/upload/group`: Upload a group image
- **POST** `/upload/expense`: Upload an image for an expense

## Data models

### Users

```json
{
  "id": "unique_user_id",
  "username": "string",
  "email": "string",
  "passwordHash": "string",
  "profileImage": "string"
}
```

### Groups

```json
{
  "id": "unique_group_id",
  "joinCode": "string",
  "name": "string",
  "description": "string",
  "ownerId": "unique_user_id",
  "members": ["unique_user_id1", "unique_user_id2"],
  "image": "string"
}
```

### Expenses

```json
{
  "id": "unique_expense_id",
  "groupId": "unique_group_id",
  "amount": "number",
  "currency": "string", // (ex : "EUR", "USD")
  "label": "string",
  "type": "string", // "expense", "transfer", "reimbursement", etc.
  "payerId": "unique_user_id",
  "users": ["unique_user_id1", "unique_user_id2"],
  "splitType": "string", // "equitable", "shares", "amounts"
  "splitValues": { // If splitType is "shares" ou "amounts"
    "unique_user_id1": "number", // amount or share for each user
    "unique_user_id2": "number"
  },
  "date": "string",
  "image": "string"
}

```

## Stack

Node.js with Express for the API
SQLite as the database
Multer for handling image uploads
Bcrypt for password hashing
JSON Web Tokens (JWT) for authentication

### Dependances

- express : to create the web server
- sqlite3 : to interact with our SQLite database
- bcrypt : to hash passwords securely
- jsonwebtoken : to generate and verify JWT tokens
- multer : to manage image uploads
- dotenv : to manage environment variables (e.g. secret keys for JWT)
