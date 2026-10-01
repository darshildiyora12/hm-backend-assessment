import { Pool } from 'pg';
import { logger } from '../utils/logger';


export const shard1Pool = new Pool({
  connectionString: process.env.SHARD1_DB_URL || 'postgresql://postgres:password@localhost:5432/orders_shard',
  max: 20,
});

export const shard2Pool = new Pool({
  connectionString: process.env.SHARD2_DB_URL || 'postgresql://postgres:password@localhost:5433/orders_shard',
  max: 20,
});


export const getShardIndex = (customerId: string): number => {
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) {
    hash = (hash << 5) - hash + customerId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2;
};

export const getPoolForCustomer = (customerId: string): Pool => {
  const shardIndex = getShardIndex(customerId);
  return shardIndex === 0 ? shard1Pool : shard2Pool;
};

export const testDbConnections = async () => {
  try {
    await shard1Pool.query('SELECT 1');
    logger.info('Connected to Shard 1 successfully.');
    await shard2Pool.query('SELECT 1');
    logger.info('Connected to Shard 2 successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to database shards');
    process.exit(1);
  }
};
