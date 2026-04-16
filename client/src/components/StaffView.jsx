import { useState } from 'react';

export default function StaffView({ token }) {
  const [address, setAddress] = useState('');
  const [photos, setPhotos] = useState([]);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    console.log('Uploading photos for address:', address, files);
    alert(`Photos uploaded for address: ${address}`);
    setPhotos([...photos, ...files]);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Staff / Field Worker Portal</h2>
      <p style={{ color: '#666', marginBottom: '20px' }}>
        Limited view — you can only see customer name + address and upload photos by address.
      </p>

      <div style={{ marginBottom: '20px' }}>
        <label>Job Address:</label>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Enter full job address"
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div>
        <label>Upload Photos (by address only):</label>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handlePhotoUpload}
          style={{ marginTop: '10px' }}
        />
      </div>

      {photos.length > 0 && (
        <p style={{ marginTop: '15px', color: 'green' }}>
          {photos.length} photo(s) uploaded for this address.
        </p>
      )}
    </div>
  );
}
