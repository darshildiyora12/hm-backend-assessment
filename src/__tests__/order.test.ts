import { getShardIndex } from '../config/db';

describe('Sharding Logic', () => {
  it('should route CUST100 and CUST200 to shards correctly', () => {
    const shard1 = getShardIndex('CUST100');
    const shard2 = getShardIndex('CUST200');
    

    expect(shard1).toBeDefined();
    expect(shard2).toBeDefined();
    expect(shard1).toBeLessThan(2);
    expect(shard2).toBeLessThan(2);
  });
});
