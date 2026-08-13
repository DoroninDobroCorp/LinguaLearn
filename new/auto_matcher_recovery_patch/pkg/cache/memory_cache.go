package cache

import "sync"

type key interface {
	int | string
}

type MemoryCacheInterface[K key, V any] interface {
	Len() int
	Write(key K, value V)
	WriteUnsafe(key K, value V)
	Read(key K) (V, bool)
	ReadUnsafe(key K) (V, bool)
	ReadAll() map[K]V
	ReadAllUnsafe() map[K]V
	Delete(key K)
	Clean()
	CleanUnsafe()
	Lock()
	Unlock()
}

type MemoryCache[K key, V any] struct {
	m    sync.RWMutex
	data map[K]V
}

func NewMemoryCache[K key, V any]() MemoryCacheInterface[K, V] {
	return &MemoryCache[K, V]{
		data: make(map[K]V),
	}
}

func (m *MemoryCache[K, V]) Len() int {
	m.m.Lock()
	defer m.m.Unlock()

	return len(m.data)
}

func (m *MemoryCache[K, V]) Write(key K, value V) {
	m.m.Lock()
	defer m.m.Unlock()

	m.data[key] = value
}

func (m *MemoryCache[K, V]) ReadAll() map[K]V {
	m.m.RLock()
	defer m.m.RUnlock()

	newMap := make(map[K]V, len(m.data))
	for k, v := range m.data {
		newMap[k] = v
	}

	return newMap
}

func (m *MemoryCache[K, V]) ReadAllUnsafe() map[K]V {
	return m.data
}

func (m *MemoryCache[K, V]) Read(key K) (V, bool) {
	m.m.RLock()
	defer m.m.RUnlock()

	value, ok := m.data[key]

	return value, ok
}

func (m *MemoryCache[K, V]) ReadUnsafe(key K) (V, bool) {
	value, ok := m.data[key]
	return value, ok
}

func (m *MemoryCache[K, V]) WriteUnsafe(key K, value V) {
	m.data[key] = value
}

func (m *MemoryCache[K, V]) Delete(key K) {
	m.m.Lock()
	defer m.m.Unlock()
	delete(m.data, key)
}

func (m *MemoryCache[K, V]) Clean() {
	m.m.Lock()
	defer m.m.Unlock()
	m.data = make(map[K]V)
}

func (m *MemoryCache[K, V]) CleanUnsafe() {
	m.data = make(map[K]V)
}

func (m *MemoryCache[K, V]) Lock() {
	m.m.Lock()
}

func (m *MemoryCache[K, V]) Unlock() {
	m.m.Unlock()
}
