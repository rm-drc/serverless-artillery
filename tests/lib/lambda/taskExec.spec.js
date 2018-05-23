const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const EventEmitter = require('events')
const path = require('path')
const sinon = require('sinon')
const sinonChai = require('sinon-chai')

chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.should()

const expect = chai.expect

// eslint-disable-next-line import/no-dynamic-require
const artillery = require(path.join('..', '..', '..', 'lib', 'lambda', 'node_modules', 'artillery-core'))
// eslint-disable-next-line import/no-dynamic-require
const taskExec = require(path.join('..', '..', '..', 'lib', 'lambda', 'taskExec.js'))

let script

describe('./lib/lambda/taskExec.js', () => {
  describe(':impl', () => {
    describe('#loadProcessor', () => {
      it('loads custom processor code based on script configuration', () => {
        const newScript = {
          config: {
            processor: `${__dirname}/customprocessor.js`,
          },
        }
        taskExec.impl.loadProcessor(newScript)
        expect(newScript.config.processor.testMethod()).to.equal('testValue')
      })
      it('does not attempt to reload a previously loaded processor', () => {
        const newScript = {
          config: {
            processor: {
              f: () => 'testValue',
            },
          },
        }
        taskExec.impl.loadProcessor(newScript)
        expect(newScript.config.processor.f()).to.equal('testValue')
      })
    })

    describe('#readPayload', () => {
      it('reads a single payload file.', () => {
        const newScript = {
          config: {
            payload: {
              path: path.join(__dirname, 'example.0.csv'),
            },
          },
        }
        const payload = taskExec.impl.readPayload(newScript)
        expect(payload).to.deep.equal([
          ['123456', 'John Doe'],
          ['234567', 'Jane Doe'],
          ['345678', 'Baby Doe'],
        ])
      })
      it('reads a set of payload files.', () => {
        const newScript = {
          config: {
            payload: [
              {
                path: path.join(__dirname, 'example.0.csv'),
              },
              {
                path: path.join(__dirname, 'example.1.csv'),
              },
            ],
          },
        }
        const payload = taskExec.impl.readPayload(newScript)
        expect(payload).to.deep.equal([
          {
            path: path.join(__dirname, 'example.0.csv'),
            data: [
              ['123456', 'John Doe'],
              ['234567', 'Jane Doe'],
              ['345678', 'Baby Doe'],
            ],
          },
          {
            path: path.join(__dirname, 'example.1.csv'),
            data: [
              ['123457', 'John Jones'],
              ['234568', 'Jane Jones'],
              ['345679', 'Baby Jones'],
            ],
          },
        ])
      })
      it('rejects a string payload value', () => {
        const newScript = {
          config: {
            payload: 'a string',
          },
        }
        const payload = taskExec.impl.readPayload(newScript)
        expect(payload).to.be.undefined
      })
      it('reads a payload file with options.', () => {
        const newScript = {
          config: {
            payload: {
              path: path.join(__dirname, 'example.0.csv'),
              options: { from: 2 },
            },
          },
        }
        const payload = taskExec.impl.readPayload(newScript)
        expect(payload).to.deep.equal([
          ['234567', 'Jane Doe'],
          ['345678', 'Baby Doe'],
        ])
      })
    })

    describe('#execLoad', () => {
      let loadProcessorStub
      let readPayloadStub
      let runner
      let runnerStub
      beforeEach(() => {
        loadProcessorStub = sinon.stub(taskExec.impl, 'loadProcessor').returns()
        readPayloadStub = sinon.stub(taskExec.impl, 'readPayload').returns()
        runner = new EventEmitter()
        runner.run = () => {}
        runnerStub = sinon.stub(artillery, 'runner').returns(runner)
      })
      afterEach(() => {
        loadProcessorStub.restore()
        readPayloadStub.restore()
        runnerStub.restore()
      })
      it('does nothing in simulation mode', () => {
        script = { _trace: true, _simulation: true }
        return taskExec.impl.execLoad(1, script)
          .should.eventually.eql({ Payload: '{ "errors": 0 }' })
          .then(() => {
            expect(loadProcessorStub).to.not.be.called
            expect(readPayloadStub).to.not.be.called
            expect(runnerStub).to.not.be.called
          })
      })
      it('"loads" a processor, "reads" a payload, and "executes" the script before the callback is executed in standard mode', () => {
        script = {}
        const opts = {}
        const report = {}
        const ret = taskExec.impl.execLoad(1, script)
          .should.eventually.equal(report)
          .then(() => {
            expect(loadProcessorStub).to.be.calledOnce
            expect(loadProcessorStub).to.be.calledBefore(readPayloadStub)
            expect(readPayloadStub).to.be.calledAfter(loadProcessorStub)
            expect(readPayloadStub).to.be.calledOnce
            expect(readPayloadStub).to.be.calledBefore(runnerStub)
            expect(runnerStub).to.be.calledAfter(readPayloadStub)
            expect(runnerStub).to.be.calledOnce
          })
        runner.emit('phaseStarted', opts)
        runner.emit('phaseCompleted', opts)
        runner.emit('done', report)
        return ret
      })
      it('"loads" a processor, "reads" a payload, and "executes" the script before the callback is executed in trace mode', () => {
        script = { _trace: true }
        const opts = {}
        const report = {}
        const ret = taskExec.impl.execLoad(1, script)
          .should.eventually.equal(report)
          .then(() => {
            expect(loadProcessorStub).to.be.calledOnce
            expect(loadProcessorStub).to.be.calledBefore(readPayloadStub)
            expect(readPayloadStub).to.be.calledAfter(loadProcessorStub)
            expect(readPayloadStub).to.be.calledOnce
            expect(readPayloadStub).to.be.calledBefore(runnerStub)
            expect(runnerStub).to.be.calledAfter(readPayloadStub)
            expect(runnerStub).to.be.calledOnce
          })
        runner.emit('phaseStarted', opts)
        runner.emit('phaseCompleted', opts)
        runner.emit('done', report)
        return ret
      })
      it('handled exepected errors in the artillery runner or runner event invocations', () => {
        script = {}
        runnerStub.throws()
        return taskExec.impl.execLoad(1, script)
          .should.eventually.be.rejected
          .then(() => {
            expect(loadProcessorStub).to.be.calledOnce
            expect(loadProcessorStub).to.be.calledBefore(readPayloadStub)
            expect(readPayloadStub).to.be.calledAfter(loadProcessorStub)
            expect(readPayloadStub).to.be.calledOnce
            expect(readPayloadStub).to.be.calledBefore(runnerStub)
            expect(runnerStub).to.be.calledAfter(readPayloadStub)
            expect(runnerStub).to.be.calledOnce
          })
      })
    })
  })
})
