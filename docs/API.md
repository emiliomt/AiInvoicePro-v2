
# API Reference

## Authentication

All API endpoints require authentication via session cookies.

## Invoice Management

### Upload Invoice
```http
POST /api/invoices/upload
Content-Type: multipart/form-data

Form data:
- invoice: File (PDF, JPG, PNG, XML)
```

### Get Invoices
```http
GET /api/invoices
```

### Get Invoice by ID
```http
GET /api/invoices/:id
```

## Project Management

### Get Projects
```http
GET /api/projects
```

### Create Project
```http
POST /api/projects
Content-Type: application/json

{
  "projectId": "string",
  "name": "string",
  "description": "string",
  "address": "string",
  "budget": "string"
}
```

## Purchase Orders

### Upload Purchase Orders
```http
POST /api/purchase-orders/upload
Content-Type: multipart/form-data

Form data:
- po: File (PDF)
```

### Get Purchase Orders
```http
GET /api/purchase-orders
```

## ERP Automation

### Create ERP Connection
```http
POST /api/erp/connections
Content-Type: application/json

{
  "name": "string",
  "baseUrl": "string",
  "username": "string",
  "password": "string"
}
```

### Execute RPA Task
```http
POST /api/erp/tasks
Content-Type: application/json

{
  "connectionId": "number",
  "taskDescription": "string"
}
```
