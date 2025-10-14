import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3Client from "../config/s3.js";

// Function to delete an image from S3
export async function deleteImageFromS3(s3Url) {
  try {
    if (!s3Url) {
      console.log("No S3 URL provided for deletion");
      return false;
    }

    // Extract bucket and key from S3 URL
    const url = new URL(s3Url);
    const pathParts = url.pathname.split('/').filter(part => part);
    
    if (pathParts.length < 2) {
      console.error("Invalid S3 URL format:", s3Url);
      return false;
    }

    const bucket = pathParts[0];
    const key = pathParts.slice(1).join('/');

    console.log(`Attempting to delete from S3 - Bucket: ${bucket}, Key: ${key}`);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    await s3Client.send(deleteCommand);
    console.log(`Successfully deleted from S3: ${key}`);
    return true;
  } catch (error) {
    console.error("Error deleting from S3:", error);
    return false;
  }
}
