import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';

// Only a fixed regional OSM snapshot is persisted, never users or journeys.
export class RestaurantCatalog {
  constructor(load,file,now=Date.now) { this.load=load;this.file=file;this.now=now;this.snapshot=null;this.pending=null;this.initialized=null; }
  async restore() {
    if(this.file) try {
        const raw=await readFile(this.file,'utf8');
        if(raw.length>4_000_000) throw new Error('Catalog too large.');
        const data=JSON.parse(raw);
        if(Number.isFinite(data.updatedAt) && Array.isArray(data.elements)) this.snapshot=data;
    } catch { /* Missing/corrupt cache: retrieve a new snapshot. */ }
  }
  async current() {
    this.initialized ||= this.restore();await this.initialized;
    if(this.snapshot && this.now()-this.snapshot.updatedAt<86400000 && this.snapshot.updatedAt<=this.now()) return this.snapshot;
    if(this.pending) return this.pending;
    this.pending=(async()=> {
      const data=await this.load();
      if(!Array.isArray(data.elements) || !data.elements.length) throw new Error('Restaurant catalog empty; retaining previous snapshot.');
      const snapshot={updatedAt:this.now(),elements:data.elements};
      if(this.file) {
        await mkdir(dirname(this.file),{recursive:true});
        await writeFile(this.file+'.tmp',JSON.stringify(snapshot),'utf8');
        await rename(this.file+'.tmp',this.file);
      }
      this.snapshot=snapshot;return snapshot;
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
}
