import deserializeLisp from './deserializeLisp.js';
import serializeLisp from './serializeLisp.js';
import update3DModelPathInNode from './update3DModelPathInNode.js';

function update3DModelPath(content, projectName) {
  // Parse the content into a structured format
  const parsed = deserializeLisp(content);
  
  // Update the 3D model paths in the parsed structure
  const updated = update3DModelPathInNode(parsed, projectName);
  
  // Serialize back to string format
  return serializeLisp(updated);
}

export default update3DModelPath;
