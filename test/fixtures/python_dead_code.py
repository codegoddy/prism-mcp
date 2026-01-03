class User:
    def __init__(self, name):
        self.name = name
    
    def __str__(self):
        return f"User({self.name})"
    
    def __repr__(self):
        return self.__str__()
    
    def used_method(self):
        return self.name
    
    def unused_method(self):
        return "I am dead"

def main():
    u = User("Alice")
    print(u.used_method())

if __name__ == "__main__":
    main()
