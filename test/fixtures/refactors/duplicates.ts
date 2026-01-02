function processA() {
    console.log("Starting process A");
    let a = 1;
    for (let i = 0; i < 10; i++) {
        a += i;
    }
    console.log("Result:", a);
    console.log("Finished process A");
}

function processB() {
    console.log("Starting process B");
    let a = 1;
    for (let i = 0; i < 10; i++) {
        a += i;
    }
    console.log("Result:", a);
    console.log("Finished process B");
}
