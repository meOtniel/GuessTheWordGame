import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { GUEST_API, isLocalPage, isLoopback, requiredRole, roleAllows } from './policy'

const q = (search = '') => new URLSearchParams(search)

test('the tablet can follow and play a game', () => {
  assert.equal(requiredRole('/api/session', q(), 'GET'), 'guest')
  assert.equal(requiredRole('/api/stream', q(), 'GET'), 'guest')
  assert.equal(requiredRole('/api/answer', q(), 'POST'), 'guest')
  assert.equal(requiredRole('/api/hint', q(), 'POST'), 'guest')
})

test('starting and wiping a session stays with the host', () => {
  assert.equal(requiredRole('/api/session', q(), 'POST'), 'host')
  assert.equal(requiredRole('/api/session', q(), 'DELETE'), 'host')
})

test('the answer is never handed to a guest device', () => {
  // ?host=1 is what puts the current answer in the payload.
  assert.equal(requiredRole('/api/session', q('host=1'), 'GET'), 'host')
  assert.equal(requiredRole('/api/stream', q('host=1'), 'GET'), 'host')
  assert.equal(requiredRole('/admin', q(), 'GET'), 'host')
})

test('moderator-only endpoints are host-only', () => {
  for (const route of ['/api/admin', '/api/judge', '/api/network', '/api/categories', '/api/feasibility']) {
    assert.equal(requiredRole(route, q(), 'POST'), 'host', route)
  }
})

/**
 * The guard that matters: a route added later is host-only until someone
 * deliberately lists it, so forgetting this file cannot open a hole — it can
 * only lock the moderator's own console out, which is noticed immediately.
 */
test('an unknown route defaults to host-only', () => {
  assert.equal(requiredRole('/api/something-new', q(), 'POST'), 'host')
  assert.equal(requiredRole('/api/something-new', q(), 'GET'), 'host')
  assert.equal(requiredRole('/scoreboard', q(), 'GET'), 'host')
})

test('every guest-listed route still exists', () => {
  const routes = readdirSync(path.join(process.cwd(), 'src', 'app', 'api'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/api/${entry.name}`)
  for (const listed of Object.keys(GUEST_API)) {
    assert.ok(routes.includes(listed), `${listed} is opened to guests but no longer exists`)
  }
})

test('a host code opens everything, a guest code only guest surfaces', () => {
  assert.equal(roleAllows('host', 'host'), true)
  assert.equal(roleAllows('host', 'guest'), true)
  assert.equal(roleAllows('guest', 'guest'), true)
  assert.equal(roleAllows('guest', 'host'), false)
  assert.equal(roleAllows(null, 'guest'), false)
  assert.equal(roleAllows(null, 'host'), false)
})

test('the codes page is machine-only, not a guest or host page', () => {
  assert.equal(isLocalPage('/codes'), true)
  assert.equal(isLocalPage('/admin'), false)
  assert.equal(isLocalPage('/play'), false)
})

test('only the machine itself counts as local', () => {
  for (const address of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.0.1, 10.0.0.4']) {
    assert.equal(isLoopback(address), true, address)
  }
  for (const address of ['192.168.1.42', '10.0.0.4', '::ffff:192.168.1.42', '10.0.0.4, 127.0.0.1', '']) {
    assert.equal(isLoopback(address), false, address)
  }
  assert.equal(isLoopback(null), false)
})
