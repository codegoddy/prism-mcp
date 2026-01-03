
import React, { useState } from 'react';
import * as utils from './utils.js';
import type { User } from './types.js';
import './side-effect.css';

export function load() {
  const mod = require('./legacy.js');
  
  import('./dynamic.js').then(m => {
    console.log(m);
  });
  
  const path = require('path');
}
