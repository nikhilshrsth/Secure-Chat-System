const cloudinary = require('cloudinary').v2;
const path = require('path');

cloudinary.config({ secure: true });

function isCloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_URL);
}

function uploadProfilePicture(buffer, userId, mimeType = '') {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL in .env.');
  }

  const folderRoot = process.env.CLOUDINARY_FOLDER || 'scs';
  const folder = `${folderRoot}/profile-pictures`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: `${userId}-${Date.now()}`,
        overwrite: false,
        resource_type: 'image',
        format: extensionFromMimeType(mimeType),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
}

function deleteProfilePicture(publicIdOrUrl) {
  if (!isCloudinaryConfigured() || !publicIdOrUrl) return Promise.resolve();

  const publicId = publicIdOrUrl.includes('/') && publicIdOrUrl.startsWith('http')
    ? extractPublicIdFromUrl(publicIdOrUrl)
    : publicIdOrUrl;

  if (!publicId) return Promise.resolve();

  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

function extensionFromMimeType(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function extractPublicIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/upload/');
    if (parts.length < 2) return null;

    let publicPath = parts[1];
    publicPath = publicPath.replace(/^v\d+\//, '');
    const ext = path.extname(publicPath);
    return ext ? publicPath.slice(0, -ext.length) : publicPath;
  } catch {
    return null;
  }
}

module.exports = {
  isCloudinaryConfigured,
  uploadProfilePicture,
  deleteProfilePicture,
  extractPublicIdFromUrl,
};
