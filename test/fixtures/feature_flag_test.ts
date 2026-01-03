
const FLAGS = {
  NEW_UI: true,
  EXPERIMENTAL: false
};

function main() {
  if (process.env.NODE_ENV === 'production') {
    console.log('Running in production');
  } else {
    console.log('Running in dev');
  }

  const isUIEnabled = FLAGS.NEW_UI;
  if (isUIEnabled) {
      renderNewUI();
  }

  // Ternary
  const config = process.env.DEBUG ? 'debug' : 'minimal';
  
  // Guard
  process.env.ENABLE_LOGGING && setupLogging();
}

function renderNewUI() {}
function setupLogging() {}
