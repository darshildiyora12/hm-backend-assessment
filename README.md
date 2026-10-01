# Backend Engineering Assessment

This project is a scalable Node.js backend application designed to handle high-volume file uploads, data parsing, and insertion into a sharded PostgreSQL database.

## 🚀 Setup and Run Instructions

### Prerequisites
- [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/)
- [Node.js](https://nodejs.org/) (v18+)
- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (for ADC)

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy the `.env.example` file to create a `.env` file:
```bash
cp .env.example .env
```
Update the `GCS_BUCKET_NAME` with your Google Cloud Storage bucket name.

### 3. Start PostgreSQL Database Shards
The database is partitioned into two shards using Docker Compose. Run:
```bash
docker compose up -d
```
This starts two PostgreSQL instances (`shard1` on port 5432, `shard2` on port 5433) and automatically initializes the `orders` table schemas.

### 4. Configure Google Cloud ADC (Application Default Credentials)
To authenticate the application with Google Cloud Storage:
```bash
gcloud auth application-default login
```
*Follow the prompts to log in via your browser. This will securely store your credentials locally, and the Node.js application will automatically pick them up without needing hardcoded keys.*

### 5. Start the Application
Run the server in development mode:
```bash
npm run dev
```

---

## 🛠 Features and API

### 1. Upload Orders File
**POST `/upload-orders`**
- **Content-Type**: `multipart/form-data`
- **Body**: Attach your CSV file using the key `file`.
- **Action**: Streams the file to GCS, parses the CSV efficiently in chunks, and batches the insertions to the database shards.

### 2. Get Order by ID (Bonus)
**GET `/orders/:orderId`**
- Fetches a specific order by ID. (Queries both shards).

### 3. Get Orders by Customer ID (Bonus)
**GET `/orders?customerId=XYZ`**
- Fetches all orders for a specific customer. (Efficiently routes directly to the correct shard).

---

## ☁️ How Google ADC is Configured

Google **Application Default Credentials (ADC)** provides a robust and secure way for applications to authenticate with Google Cloud services (like GCS) without embedding or hardcoding service account JSON keys in the source code.

In this project, the `@google-cloud/storage` SDK is initialized with no arguments:
```typescript
const storage = new Storage();
```
Behind the scenes, the SDK automatically looks for credentials in the following order:
1. `GOOGLE_APPLICATION_CREDENTIALS` environment variable (if explicitly set to a JSON key path).
2. User credentials set up via `gcloud auth application-default login` (used here).
3. The attached service account (if running on GCP environments like Cloud Run, GKE, or Compute Engine).

This adheres strictly to modern cloud security best practices.

---

## 🗄 Explanation of Sharding Strategy

### Strategy: Application-Level Hash Sharding
This system utilizes **Application-level sharding** across multiple PostgreSQL databases.

**Shard Key**: `customer_id`

**Why `customer_id`?** 
Choosing `customer_id` as the shard key ensures that all orders belonging to a specific customer always reside on the same shard. This allows us to efficiently query a customer's entire order history (`GET /orders?customerId=...`) without needing to perform expensive scatter-gather queries across all databases.

**Routing Logic**:
The application computes a string hash of the `customer_id` and uses a modulo operator (`% number_of_shards`) to determine the destination shard.
```typescript
const getShardIndex = (customerId: string): number => {
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) {
    hash = (hash << 5) - hash + customerId.charCodeAt(i);
    hash |= 0; 
  }
  return Math.abs(hash) % 2; // Returns 0 for Shard 1, 1 for Shard 2
};
```

---

## 🧠 Design Decisions and Trade-offs

1. **Streaming vs Loading in Memory**: 
   The CSV parser reads the file in chunks using Node.js streams (`fs.createReadStream().pipe(csvParser())`). This means the application can handle files much larger than the available RAM, satisfying the requirement that the full file is not loaded into memory at once.

2. **Batch Inserts & Transactions**:
   To prevent inserting records one-by-one, which incurs massive network latency and I/O overhead, rows are grouped by their destination shard in memory arrays up to a `batchSize` of 1,000. When a batch fills up, an `INSERT ... VALUES (...), (...)...` query is executed inside a transaction block (`BEGIN` / `COMMIT`). If a batch fails, it is rolled back without affecting the rest of the file.

3. **GCS Upload First, DB Processing Second**:
   The file is immediately piped to GCS for persistence. Once successful, it is parsed and written to the database. This guarantees we have a backup of the raw data on GCS even if the database encounters connection issues.

curl -X POST http://localhost:3000/upload-orders -F "file=@test.csv"


curl http://localhost:3000/orders\?customerId\=CUST100

curl http://localhost:3000/orders/ORD003

npm run test