import React from 'react';

const MyComponent = ({ onClick }: { onClick: () => void }) => {
    return <button onClick={onClick}>Click me</button>;
};

export const Page = () => {
    const handleButtonClick = () => {
        console.log('Button clicked');
    };

    const unusedHandler = () => {
        console.log('Unused');
    };

    return (
        <div>
            <h1>Framework Usage Test</h1>
            <MyComponent onClick={handleButtonClick} />
        </div>
    );
};
