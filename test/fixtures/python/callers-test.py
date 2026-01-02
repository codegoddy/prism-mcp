# Test fixture for find_callers

def helper():
    print("helper called")

def main():
    helper()
    helper()

def process():
    main()
    helper()
