#ifndef GRAPH_H
#define GRAPH_H

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <memory>

namespace prism {

struct Position {
  int row;
  int column;
};

struct Symbol {
  std::string id;
  std::string name;
  std::string type;  // "function", "method", "variable", "class", "parameter"
  std::string filePath;
  int line = 0;
  int column = 0;
  std::string className;
  bool isExported = false;
  bool isStatic = false;
};

struct Reference {
  std::string id;
  std::string fromSymbolId;
  std::string toSymbolId;
  std::string type;  // "direct", "method", "callback", "indirect"
  std::string filePath;
  int line = 0;
  int column = 0;
};

struct ImportEntry {
  std::string source;
  std::vector<std::string> imported;
  bool isTypeOnly = false;
};

struct FileData {
  std::string path;
  std::vector<Symbol> symbols;
  std::vector<ImportEntry> imports;
};

struct GraphStats {
  size_t totalSymbols;
  size_t totalReferences;
  size_t totalFiles;
  size_t memoryUsageBytes;
};

class ReferenceGraph {
 private:
  std::unordered_map<std::string, Symbol> symbols_;
  std::unordered_map<std::string, Reference> references_;
  std::unordered_map<std::string, std::vector<std::string>> symbolToReferences_;
  std::unordered_map<std::string, std::vector<std::string>> symbolToCallers_;
  std::unordered_map<std::string, FileData> files_;
  std::unordered_set<std::string> dirtyFiles_;

 public:
  ReferenceGraph();
  ~ReferenceGraph();

  // Symbol management
  void addSymbol(const Symbol& symbol);
  void addSymbols(const std::vector<Symbol>& symbols);
  bool hasSymbol(const std::string& symbolId) const;
  Symbol getSymbol(const std::string& symbolId) const;
  std::vector<Symbol> getAllSymbols() const;

  // Reference management
  void addReference(const Reference& reference);
  void addReferences(const std::vector<Reference>& references);
  void removeReferences(const std::string& symbolId);
  std::vector<Reference> findCallers(const std::string& symbolId) const;
  std::vector<Reference> findCallees(const std::string& symbolId) const;

  // File management
  void addFile(const FileData& file);
  void updateFile(const std::string& filePath, const FileData& file);
  void removeFile(const std::string& filePath);
  void markFileDirty(const std::string& filePath);
  void clearDirtyFiles();
  bool hasFile(const std::string& filePath) const;

  // Query operations
  bool isSymbolUsed(const std::string& symbolId) const;
  std::vector<Symbol> findUnusedSymbols() const;
  std::vector<Symbol> findSymbolsByName(const std::string& name) const;
  std::vector<Symbol> findSymbolsByFile(const std::string& filePath) const;
  std::vector<Symbol> findExportedSymbols() const;

  // Statistics
  GraphStats getStats() const;
  size_t size() const;
  void clear();

 private:
  std::string generateSymbolId(const std::string& name, const std::string& filePath, int line) const;
  size_t calculateMemoryUsage() const;
};

}  // namespace prism

#endif  // GRAPH_H
