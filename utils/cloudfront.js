// Utility function to convert S3 URLs to CloudFront URLs
export function convertToCloudFrontUrl(s3Url) {
  if (!s3Url) return '';
  
  // If it's already a CloudFront URL, return as is
  if (s3Url.includes('cloudfront.net')) {
    return s3Url;
  }
  
  // If it's an S3 URL, convert to CloudFront
  if (s3Url.includes('s3.amazonaws.com') || s3Url.includes('s3-')) {
    // Extract the bucket and key from S3 URL
    const url = new URL(s3Url);
    const pathParts = url.pathname.split('/').filter(part => part);
    
    if (pathParts.length >= 2) {
      const bucket = pathParts[0];
      const key = pathParts.slice(1).join('/');
      
      // Replace with your CloudFront domain
      const cloudFrontDomain = process.env.CLOUDFRONT_SIDE_URL || process.env.CLOUDFRONT_DOMAIN || 'd8pw2hr56z2an.cloudfront.net';
      // Ensure we're using the correct CloudFront URL format
      if (cloudFrontDomain.includes('https://')) {
        return `${cloudFrontDomain}/${key}`;
      }
      return `https://${cloudFrontDomain}/${key}`;
    }
  }
  
  // If it's already a relative URL or doesn't match S3 pattern, return as is
  return s3Url;
}
