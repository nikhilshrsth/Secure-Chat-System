const mongoose = require('mongoose');

const scanSummarySchema = new mongoose.Schema(
  {
    tool: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'not_run'],
      default: 'not_run',
    },
    summary: {
      type: String,
      default: '',
      maxlength: 500,
    },
    criticalFindings: {
      type: Number,
      default: 0,
    },
    highFindings: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const devSecOpsScanSchema = new mongoose.Schema(
  {
    buildStatus: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'running'],
      default: 'passed',
    },
    sastStatus: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'not_run'],
      default: 'not_run',
    },
    dastStatus: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'not_run'],
      default: 'not_run',
    },
    dependencyStatus: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'not_run'],
      default: 'not_run',
    },
    unitTestStatus: {
      type: String,
      enum: ['passed', 'warning', 'failed', 'not_run'],
      default: 'not_run',
    },
    environment: {
      type: String,
      enum: ['development', 'staging', 'production'],
      default: 'development',
    },
    rollbackStatus: {
      type: String,
      enum: ['available', 'not_available', 'in_progress'],
      default: 'available',
    },
    deployedAt: {
      type: Date,
      default: null,
    },
    scanSummaries: [scanSummarySchema],
  },
  { timestamps: true },
);

devSecOpsScanSchema.index({ createdAt: -1 });

module.exports = mongoose.model('DevSecOpsScan', devSecOpsScanSchema);
