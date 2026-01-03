import React, { Component } from 'react';

interface Props {
  zIndex: number;
}

export class StickyScroll extends Component<Props> {
  constructor(props: Props) {
    super(props);
    console.log('Constructor called');
  }

  componentDidMount() {
    console.log('Mounted');
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  unusedMethod() {
    return 'I am unused';
  }

  render() {
    const { zIndex } = this.props;
    // Shorthand property usage
    const style = { zIndex };
    
    return (
      <div style={style}>
        Sticky Content
      </div>
    );
  }
}

export const unusedExport = 42;
const unusedInternal = 'shh';
