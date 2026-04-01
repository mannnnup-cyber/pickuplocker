import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function main() {
  const zai = await ZAI.create();
  
  // Read the most recent image
  const imagePath = '/home/z/my-project/upload/pasted_image_1773028681003.png';
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  
  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in detail. What is shown? Include any text, buttons, numbers, or data visible in the interface.'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  });

  console.log('Image Analysis:');
  console.log(response.choices[0]?.message?.content);
}

main().catch(console.error);
