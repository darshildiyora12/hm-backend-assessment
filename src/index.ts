import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { uploadOrders, getOrder, getOrdersByCustomer } from './controllers/order.controller';
import { testDbConnections } from './config/db';
import { logger } from './utils/logger';

const app = express();
const port = process.env.PORT || 3000;


if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const upload = multer({ dest: 'uploads/' });

app.use(express.json());


app.post('/upload-orders', upload.single('file'), uploadOrders);
app.get('/orders/:orderId', getOrder);
app.get('/orders', getOrdersByCustomer);


app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, async () => {
  logger.info(`Server is running on port ${port}`);
  await testDbConnections();
});
