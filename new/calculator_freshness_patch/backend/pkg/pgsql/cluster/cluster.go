package cluster

import "golang.org/x/exp/constraints"

type Cluster[ShardKey constraints.Integer] struct {
	nodes []Node[ShardKey]
}

func NewCluster[ShardKey constraints.Integer](nodes []Node[ShardKey]) *Cluster[ShardKey] {
	return &Cluster[ShardKey]{nodes}
}

// Pick returns node by provided shard key.
func (c *Cluster[ShardKey]) Pick(key ShardKey) Node[ShardKey] {
	for _, node := range c.nodes {
		if node.Match(key) {
			return node
		}
	}

	return nil
}

// Close closes databases.
func (c *Cluster[ShardKey]) Close() {
	for _, node := range c.nodes {
		node.DB().Close()
	}
}

// Nodes returns list of nodes in the cluster.
func (c *Cluster[ShardKey]) Nodes() []Node[ShardKey] {
	return c.nodes
}
