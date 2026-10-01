const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
storage.bucket(process.env.GCS_BUCKET_NAME || 'darshil-hm2-assessment-2026').exists().then(data => {
  console.log("Bucket exists:", data[0]);
}).catch(err => {
  console.error("Error:", err.message);
});
