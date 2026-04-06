import { bucket } from '../db';

async function makeBucketPublic() {
    try {
        console.log('Fetching IAM policy...');
        const [policy] = await bucket.iam.getPolicy({requestedPolicyVersion: 3});
        
        // Find existing binding for object viewer
        let viewerBinding = policy.bindings.find((b: any) => b.role === 'roles/storage.objectViewer');
        
        if (viewerBinding) {
            if (!viewerBinding.members.includes('allUsers')) {
                 viewerBinding.members.push('allUsers');
                 console.log('Appended allUsers to existing roles/storage.objectViewer');
            } else {
                 console.log('allUsers already has roles/storage.objectViewer');
            }
        } else {
            policy.bindings.push({
                role: 'roles/storage.objectViewer',
                members: ['allUsers']
            });
            console.log('Created new binding for allUsers with roles/storage.objectViewer');
        }
        
        console.log('Setting new IAM policy...');
        await bucket.iam.setPolicy(policy);
        console.log('Success! Bucket objects are now publicly readable.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to update bucket IAM policy:', err);
        process.exit(1);
    }
}

makeBucketPublic();
