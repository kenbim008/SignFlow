/**
 * Vercel Serverless Function entry — exports the Express app so POST /signproz-api/*
 * is handled by Node instead of static HTML (avoids HTTP 405).
 */
import app from '../src/index.js';

export default app;
