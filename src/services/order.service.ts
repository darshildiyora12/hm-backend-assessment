import fs from 'fs';
import csvParser from 'csv-parser';
import { getBucket } from '../config/gcs';
import { getPoolForCustomer, shard1Pool, shard2Pool } from '../config/db';
import { logger } from '../utils/logger';

export interface OrderRow {
  order_id: string;
  customer_id: string;
  order_date: string;
  order_amount: string;
  status: string;
}

export const uploadToGCS = async (filePath: string, filename: string): Promise<string> => {
  const bucketName = process.env.GCS_BUCKET_NAME || 'default-bucket';
  const bucket = getBucket(bucketName);
  const destination = `orders/${Date.now()}-${filename}`;
  
  try {
    await bucket.upload(filePath, {
      destination,
      resumable: false,
    });
    logger.info({ destination }, 'File uploaded to GCS successfully');
    return `gs://${bucketName}/${destination}`;
  } catch (error) {
    logger.error({ error }, 'Failed to upload file to GCS');
    return 'gcs-upload-failed-or-skipped';
  }
};

export const processOrdersFile = async (filePath: string): Promise<{ success: number; failed: number }> => {
  return new Promise((resolve, reject) => {
    const batchSize = 1000;
    
    let shard1Batch: OrderRow[] = [];
    let shard2Batch: OrderRow[] = [];
    
    let successCount = 0;
    let failedCount = 0;
    
    const insertBatch = async (batch: OrderRow[], shardIndex: number) => {
      if (batch.length === 0) return;
      
      const pool = shardIndex === 0 ? shard1Pool : shard2Pool;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const values: any[] = [];
        const placeholders = batch.map((row, i) => {
          const offset = i * 5;
          values.push(row.order_id, row.customer_id, row.order_date, row.order_amount, row.status);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
        }).join(', ');
        
        const query = `
          INSERT INTO orders (order_id, customer_id, order_date, order_amount, status)
          VALUES ${placeholders}
          ON CONFLICT (order_id) DO NOTHING
        `;
        
        await client.query(query, values);
        await client.query('COMMIT');
        successCount += batch.length;
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error({ error, shardIndex }, 'Failed to insert batch');
        failedCount += batch.length; 
      } finally {
        client.release();
      }
    };
    
    const processingPromises: Promise<void>[] = [];

    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row: OrderRow) => {
        if (!row.order_id || !row.customer_id) {
          failedCount++;
          return;
        }

        let hash = 0;
        for (let i = 0; i < row.customer_id.length; i++) {
          hash = (hash << 5) - hash + row.customer_id.charCodeAt(i);
          hash |= 0;
        }
        const shardIndex = Math.abs(hash) % 2;
        
        if (shardIndex === 0) {
          shard1Batch.push(row);
        } else {
          shard2Batch.push(row);
        }

        if (shard1Batch.length >= batchSize) {
          const b = [...shard1Batch];
          shard1Batch = [];
          processingPromises.push(insertBatch(b, 0));
        }
        if (shard2Batch.length >= batchSize) {
          const b = [...shard2Batch];
          shard2Batch = [];
          processingPromises.push(insertBatch(b, 1));
        }
      })
      .on('end', async () => {
        processingPromises.push(insertBatch(shard1Batch, 0));
        processingPromises.push(insertBatch(shard2Batch, 1));
        
        try {
          await Promise.all(processingPromises);
          resolve({ success: successCount, failed: failedCount });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (error) => {
        logger.error({ error }, 'Error parsing CSV file');
        reject(error);
      });
  });
};
