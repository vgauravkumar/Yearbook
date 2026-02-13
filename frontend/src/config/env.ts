const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '';
const cloudinaryUploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ?? '';

if (!import.meta.env.VITE_API_URL && import.meta.env.DEV) {
  console.warn(
    '[Config] VITE_API_URL is not set. Falling back to http://localhost:3000. ' +
      'Set it in your .env file for correct API routing in other environments.',
  );
}

export const env = {
  apiUrl,
  cloudinary: {
    cloudName: cloudinaryCloudName,
    uploadPreset: cloudinaryUploadPreset,
  },
};
