// Test file with intentionally dead code for testing find_dead_code tool

// UNUSED - This function is never called
function unusedFunction() {
  console.log("I am never called");
}

// USED - This function is called
function usedFunction() {
  console.log("I am called");
}

// UNUSED - This class is never instantiated
class UnusedClass {
  unusedMethod() {
    console.log("unused method");
  }
  
  // Even if class is unused, we should detect this
  anotherMethod() {
    console.log("another unused method");
  }
}

// USED - This class is instantiated
class UsedClass {
  usedMethod() {
    console.log("used method");
  }
  
  // UNUSED - This method is never called even though class is used
  unusedMethodInUsedClass() {
    console.log("I am never called");
  }
}

// UNUSED - Variable never used
const unusedVariable = 42;

// USED - Variable is used
const usedVariable = 100;

// Entry point that uses some things
function main() {
  usedFunction();
  
  const instance = new UsedClass();
  instance.usedMethod();
  
  console.log(usedVariable);
}

// Export main to simulate a used entry point
export { main };
