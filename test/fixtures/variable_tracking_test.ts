export let counter = 0;

export function increment() {
  counter++;
  counter = counter + 1;
}

export function logCounter() {
  console.log(counter);
}

export function complexUsage() {
  const { counter: localCounter } = { counter: 10 };
  let x = counter;
  x = 5;
  
  if (counter > 5) {
    x += counter;
  }
}

// Config usage simulation
const config = {
  user_id: 123,
  settings: {
    theme: 'dark'
  }
};

function updateConfig() {
  config.user_id = 456;
  console.log(config.user_id);
  const { user_id } = config;
}
