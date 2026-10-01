import { Request, Response } from 'express';
import { uploadToGCS, processOrdersFile } from '../services/order.service';
import { logger } from '../utils/logger';
import fs from 'fs';
import { shard1Pool, shard2Pool } from '../config/db';

export const uploadOrders = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    logger.info({ filename: file.originalname }, 'Started processing file');


    const gcsUri = await uploadToGCS(file.path, file.originalname);


    const result = await processOrdersFile(file.path);


    fs.unlinkSync(file.path);

    logger.info(result, 'Finished processing file');
    
    res.status(200).json({
      message: 'File processed successfully',
      gcsUri,
      stats: result,
    });
  } catch (error) {
    logger.error({ error }, 'Error in uploadOrders controller');
    res.status(500).json({ error: 'Internal server error during processing' });
  }
};

export const getOrder = async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params;
  try {

    const res1 = await shard1Pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (res1.rows.length > 0) {
      res.status(200).json(res1.rows[0]);
      return;
    }
    
    const res2 = await shard2Pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (res2.rows.length > 0) {
      res.status(200).json(res2.rows[0]);
      return;
    }

    res.status(404).json({ error: 'Order not found' });
  } catch (error) {
    logger.error({ error }, 'Error fetching order by ID');
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getOrdersByCustomer = async (req: Request, res: Response): Promise<void> => {
  const { customerId } = req.query;
  if (!customerId || typeof customerId !== 'string') {
    res.status(400).json({ error: 'customerId query parameter is required' });
    return;
  }
  
  try {

    let hash = 0;
    for (let i = 0; i < customerId.length; i++) {
      hash = (hash << 5) - hash + customerId.charCodeAt(i);
      hash |= 0;
    }
    const shardIndex = Math.abs(hash) % 2;
    const pool = shardIndex === 0 ? shard1Pool : shard2Pool;

    const result = await pool.query('SELECT * FROM orders WHERE customer_id = $1', [customerId]);
    res.status(200).json(result.rows);
  } catch (error) {
    logger.error({ error }, 'Error fetching orders by customer ID');
    res.status(500).json({ error: 'Internal server error' });
  }
};
