
# AnzuDynamics - AI-Powered Invoice Procurement Platform

🚀 **Transform your invoice processing with intelligent OCR, automated data extraction, and streamlined approval workflows.**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Replit-blue)](https://replit.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

## 🌟 Features

### 🤖 AI-Powered Processing
- **Intelligent OCR**: Advanced text extraction from PDF and image invoices
- **AI Data Extraction**: OpenAI GPT-powered structured data extraction
- **Smart Validation**: Configurable business rules and automated validation
- **Predictive Analytics**: ML-based issue prediction and alerts

### 📊 Invoice Management
- **Multi-format Support**: PDF, XML, JPEG, PNG invoice processing
- **Real-time Processing**: Background processing with live status updates
- **Batch Upload**: Process multiple invoices simultaneously
- **Preview & Download**: Secure PDF preview and file management

### 🔄 Workflow Automation
- **Approval Workflows**: Multi-stage approval processes
- **PO Matching**: Automated purchase order matching with AI
- **Project Assignment**: Smart project validation and assignment
- **Discrepancy Detection**: Automated flagging of potential issues

### 🏢 ERP Integration
- **RPA Automation**: Robotic Process Automation for ERP systems
- **Invoice Importer**: Automated invoice extraction from ERP systems
- **Connection Management**: Secure ERP connection configuration
- **Scheduled Tasks**: Automated recurring data extraction

### 📈 Analytics & Reporting
- **Dashboard Analytics**: Real-time processing statistics
- **Learning Metrics**: AI model performance tracking
- **Classification System**: Automated line item categorization
- **Feedback Loop**: Continuous AI improvement through user feedback

## 🏗️ Architecture

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Application pages
│   │   ├── hooks/           # Custom React hooks
│   │   └── lib/             # Utilities and configurations
├── server/                   # Node.js backend
│   ├── services/            # Business logic services
│   │   ├── aiService.ts     # AI extraction service
│   │   ├── ocrService.ts    # OCR processing
│   │   ├── xmlParser.ts     # XML invoice parsing
│   │   └── erpAutomationService.ts # RPA automation
│   ├── routes.ts            # API endpoints
│   └── storage.ts           # Database operations
├── shared/                  # Shared types and schemas
└── migrations/              # Database migrations
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/anzudynamics-invoice-platform.git
   cd anzudynamics-invoice-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

## 🌐 Live Demo

Experience the platform live on Replit: [View Demo](https://replit.com/@yourusername/anzudynamics)

## 📸 Screenshots

### Dashboard Overview
![Dashboard](docs/images/dashboard.png)

### Invoice Processing
![Invoice Processing](docs/images/invoice-processing.png)

### AI Analytics
![AI Analytics](docs/images/ai-analytics.png)

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **Radix UI** components via shadcn/ui
- **React Query** for state management
- **Vite** for development and bundling

### Backend
- **Node.js** with TypeScript
- **Express.js** web framework
- **Drizzle ORM** for database operations
- **PostgreSQL** database
- **Passport.js** for authentication

### AI & Processing
- **OpenAI GPT** for data extraction
- **Tesseract.js** for OCR processing
- **PDF.js** for PDF handling
- **Sharp** for image processing

### Infrastructure
- **Replit** for hosting and deployment
- **Neon** for serverless PostgreSQL
- **Session-based authentication**
- **File upload with Multer**

## 📊 Database Schema

The platform uses a comprehensive PostgreSQL schema:

- **Users & Sessions**: Authentication and user management
- **Invoices & Line Items**: Core invoice data
- **Purchase Orders**: PO management and matching
- **Projects**: Project validation and assignment
- **Validation Rules**: Configurable business rules
- **ERP Connections**: RPA automation configuration
- **Feedback Logs**: AI learning and improvement

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT API
- Tesseract.js team for OCR capabilities
- Radix UI for component primitives
- Replit for hosting platform

## 🔗 Links

- [Live Demo](https://replit.com/@yourusername/anzudynamics)
- [Documentation](docs/)
- [API Reference](docs/api.md)
- [Contributing Guide](CONTRIBUTING.md)

---

Built with ❤️ on [Replit](https://replit.com)
