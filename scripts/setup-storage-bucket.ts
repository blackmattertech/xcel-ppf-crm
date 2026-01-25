import { createServiceClient } from '../lib/supabase/service'

async function setupStorageBucket() {
  const supabase = createServiceClient()

  try {
    // Check if bucket already exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      throw listError
    }

    const bucketName = 'profile-pictures'
    const existingBucket = buckets?.find(b => b.name === bucketName)

    if (existingBucket) {
      console.log(`Bucket "${bucketName}" already exists`)
      return
    }

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    })

    if (error) {
      throw error
    }

    console.log(`✅ Successfully created storage bucket: ${bucketName}`)
    console.log('Bucket configuration:')
    console.log('- Public: true')
    console.log('- Max file size: 5MB')
    console.log('- Allowed types: JPEG, PNG, WebP, GIF')
  } catch (error) {
    console.error('❌ Error setting up storage bucket:', error)
    process.exit(1)
  }
}

setupStorageBucket()
