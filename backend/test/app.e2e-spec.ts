import request from 'supertest'
import { createTestApp, type TestContext } from './helpers.js'

describe('AppController (e2e)', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestApp()
  })

  it('/ (GET)', () => {
    return request(ctx.app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!')
  })

  afterEach(async () => {
    await ctx.app.close()
  })
})
