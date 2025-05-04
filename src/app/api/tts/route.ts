// src/app/api/tts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { parseStringPromise } from 'xml2js'; // Correct import for parseStringPromise

// Define expected viseme structure from iSpeech XML (adjust based on actual format)
interface ISpeechViseme {
  $: {
    id: string; // e.g., "f", "t", "oo"
    ts: string; // Timestamp in seconds, e.g., "0.123"
  };
}

interface ISpeechVisemeResponse {
  visemes?: {
    viseme?: ISpeechViseme | ISpeechViseme[];
  };
}

// Define the structure TalkingHead expects
interface TalkingHeadViseme {
  time: number;
  value: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text');
  const lang = searchParams.get('voice') || 'usenglishfemale'; // Get 'voice' param, default

  const ISPEECH_API_KEY = process.env.ISPEECH_API_KEY;

  if (!ISPEECH_API_KEY) {
    console.error('iSpeech API key is missing in environment variables.');
    return NextResponse.json({ error: 'iSpeech API key is missing' }, { status: 500 });
  }

  if (!text) {
    return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
  }

  console.log(`TTS Request: Text='${text.substring(0, 30)}...', Lang='${lang}'`);

  try {
    // 1. Fetch audio data from iSpeech
    const audioApiUrl = `http://api.ispeech.org/api/rest?apikey=${ISPEECH_API_KEY}&action=convert&voice=${lang}&speed=0&pitch=0&volume=100&format=mp3&data=${encodeURIComponent(text)}`;
    console.log('Fetching audio from:', audioApiUrl);
    const audioRes = await axios.get(audioApiUrl, { responseType: 'arraybuffer' });

    // Check if response is valid audio
    if (!audioRes.headers['content-type'] || !audioRes.headers['content-type'].startsWith('audio/')) {
         // Try to parse as error JSON/text
         let errorDetail = 'Invalid audio response';
         try {
             const errorText = Buffer.from(audioRes.data).toString('utf-8');
             errorDetail = `iSpeech audio endpoint returned non-audio content: ${errorText}`;
             console.error(errorDetail);
         } catch {
             console.error('iSpeech audio endpoint returned non-audio content, and it was not parsable text.');
         }
         throw new Error(errorDetail);
     }

    const audioData: Buffer = Buffer.from(audioRes.data); // Use Buffer directly
    const audioBase64 = audioData.toString('base64');
    console.log(`Audio data fetched successfully (${audioData.length} bytes).`);

    // 2. Fetch viseme data from iSpeech
    const visemeApiUrl = `http://api.ispeech.org/api/rest?apikey=${ISPEECH_API_KEY}&action=viseme&voice=${lang}&speed=0&pitch=0&volume=100&format=xml&data=${encodeURIComponent(text)}`;
    console.log('Fetching visemes from:', visemeApiUrl);
    const visemeRes = await axios.get(visemeApiUrl);
    const visemeXml: string = visemeRes.data;

     // Check if response is XML before parsing
     if (!visemeRes.headers['content-type'] || !visemeRes.headers['content-type'].includes('xml')) {
         console.error('iSpeech viseme endpoint did not return XML:', visemeXml);
         throw new Error(`iSpeech viseme endpoint returned non-XML content: ${visemeXml}`);
     }

    console.log('Viseme XML received:', visemeXml.substring(0, 100) + '...'); // Log beginning of XML

    // 3. Parse viseme XML
    let formattedVisemes: TalkingHeadViseme[] = [];
    try {
        const parsedResult: ISpeechVisemeResponse = await parseStringPromise(visemeXml, {
            explicitArray: false, // Simplify structure if elements are not arrays
            ignoreAttrs: false,   // Keep attributes (like id and ts)
            attrkey: '$',         // Standard key for attributes
            charkey: '_',         // Key for text content (if any)
        });

        console.log('Parsed Viseme XML:', JSON.stringify(parsedResult, null, 2)); // Log parsed structure

        const visemeArray = parsedResult?.visemes?.viseme;

        if (visemeArray) {
            if (Array.isArray(visemeArray)) {
                formattedVisemes = visemeArray.map((v) => ({
                    time: parseFloat(v.$.ts), // Access attributes via '$'
                    value: v.$.id,
                }));
            } else if (typeof visemeArray === 'object' && visemeArray.$) { // Handle single viseme case
                formattedVisemes = [{
                    time: parseFloat(visemeArray.$.ts),
                    value: visemeArray.$.id,
                }];
            } else {
                 console.warn('Parsed viseme data is not in the expected format (array or single object with $).');
            }
        } else {
            console.warn('No visemes found in parsed XML structure.');
        }
        console.log('Formatted Visemes:', formattedVisemes);

    } catch (parseError: any) {
        console.error('Error parsing viseme XML:', parseError);
         // Decide how to handle parsing errors - maybe return audio only?
         // For now, we continue but log the error. Visemes might be empty.
         // throw new Error(`Failed to parse viseme XML: ${parseError.message}`); // Option to fail request
    }


    // 4. Return combined data in the format TalkingHead expects
    const responsePayload = {
      audio: `data:audio/mp3;base64,${audioBase64}`, // Base64 encoded audio data URI
      visemes: formattedVisemes, // Array of { time: number, value: string }
    };

    return NextResponse.json(responsePayload, { status: 200 });

  } catch (error: any) {
    console.error('Error in TTS API route:', error?.response?.data || error?.message || error);
    return NextResponse.json(
        { error: `Failed to fetch TTS data: ${error?.message || 'Unknown server error'}` },
        { status: 500 }
    );
  }
}