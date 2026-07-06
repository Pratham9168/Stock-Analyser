import { EquialphaPipelineService } from './src/services/equialpha/EquialphaPipelineService';
async function run() {
   const pipeline = new EquialphaPipelineService();
   await pipeline.executePipelineAsync();
   console.log('Pipeline finished');
}
run().catch(console.error);
