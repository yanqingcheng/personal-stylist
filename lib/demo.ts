import { z } from 'zod';
export const demoAssetPath=z.string().min(1).max(240).refine(path=>path.split('/').every(segment=>/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)&&segment!=='.'&&segment!=='..'),'Relative asset filenames only');
const id=z.string().min(1).max(100);
export const demoDocument=z.object({
 version:z.literal(1),id:z.uuid(),title:z.string().min(1).max(160),description:z.string().max(2000).optional(),
 steps:z.array(z.object({id,title:z.string().max(100),description:z.string().max(1000).optional()})).max(10).optional(),
 messages:z.array(z.discriminatedUnion('role',[
  z.object({id,role:z.literal('user'),text:z.string().min(1).max(12000),provenance:z.literal('recorded')}),
  z.object({id,role:z.literal('stylist'),text:z.string().min(1).max(12000),provenance:z.enum(['recorded','prepared'])}),
 ])).max(200).default([]),
 references:z.array(z.object({id,path:demoAssetPath,caption:z.string().max(1000)})).max(12).default([]),
 boards:z.array(z.object({id,kind:z.enum(['initial','revision']),title:z.string().max(160),description:z.string().max(4000).optional(),path:demoAssetPath,caption:z.string().max(1000).optional(),respondsTo:z.string().max(4000).optional(),options:z.array(z.object({id,title:z.string().max(160),description:z.string().max(2000).optional(),reason:z.string().max(4000).optional()})).min(1).max(8)})).max(8).default([]),
 editorial:z.object({title:z.string().max(160),story:z.string().max(16000),principles:z.array(z.string().max(1000)).max(10).optional(),path:demoAssetPath.optional()}).optional(),
});
export type DemoDocument=z.infer<typeof demoDocument>;
export type DemoPayload={status:'ready';document:DemoDocument;revision:string;storageScope:string;urls:Record<string,string|null>};
export const demoProgress=z.object({stage:z.number().int().min(0).max(4),feedback:z.record(z.string(),z.string().max(8000)),rejected:z.record(z.string(),z.boolean()),approvedBoardId:z.string().nullable(),approvedRevision:z.string().nullable()});
export type DemoProgress=z.infer<typeof demoProgress>;
export const emptyDemoProgress:DemoProgress={stage:0,feedback:{},rejected:{},approvedBoardId:null,approvedRevision:null};
