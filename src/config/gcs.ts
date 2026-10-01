import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger';


export const storage = new Storage();

export const getBucket = (bucketName: string) => {
  if (!bucketName) {
    logger.warn('GCS_BUCKET_NAME is not set, file upload to GCS will fail.');
  }
  return storage.bucket(bucketName);
};
