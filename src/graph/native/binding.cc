#include <napi.h>
#include "graph.h"

class ReferenceGraphWrapper : public Napi::ObjectWrap<ReferenceGraphWrapper> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  ReferenceGraphWrapper(const Napi::CallbackInfo& info);
  ~ReferenceGraphWrapper();

 private:
  prism::ReferenceGraph* graph_;

  // Wrapped methods
  void AddSymbol(const Napi::CallbackInfo& info);
  void AddSymbols(const Napi::CallbackInfo& info);
  Napi::Value HasSymbol(const Napi::CallbackInfo& info);
  Napi::Value GetSymbol(const Napi::CallbackInfo& info);
  Napi::Value GetAllSymbols(const Napi::CallbackInfo& info);
  
  void AddReference(const Napi::CallbackInfo& info);
  void AddReferences(const Napi::CallbackInfo& info);
  void RemoveReferences(const Napi::CallbackInfo& info);
  Napi::Value FindCallers(const Napi::CallbackInfo& info);
  Napi::Value FindCallees(const Napi::CallbackInfo& info);

  void AddFile(const Napi::CallbackInfo& info);
  void UpdateFile(const Napi::CallbackInfo& info);
  void RemoveFile(const Napi::CallbackInfo& info);
  Napi::Value HasFile(const Napi::CallbackInfo& info);

  Napi::Value IsSymbolUsed(const Napi::CallbackInfo& info);
  Napi::Value FindUnusedSymbols(const Napi::CallbackInfo& info);
  Napi::Value FindSymbolsByName(const Napi::CallbackInfo& info);
  Napi::Value FindSymbolsByFile(const Napi::CallbackInfo& info);
  Napi::Value FindExportedSymbols(const Napi::CallbackInfo& info);
  
  Napi::Value GetStats(const Napi::CallbackInfo& info);
  Napi::Value Size(const Napi::CallbackInfo& info);
  void Clear(const Napi::CallbackInfo& info);

  // Helpers
  prism::Symbol JsToSymbol(Napi::Object obj);
  Napi::Object SymbolToJs(Napi::Env env, const prism::Symbol& symbol);
  prism::Reference JsToReference(Napi::Object obj);
  Napi::Object ReferenceToJs(Napi::Env env, const prism::Reference& ref);
  prism::FileData JsToFileData(Napi::Object obj);
  prism::ImportEntry JsToImportEntry(Napi::Object obj);
};

Napi::Object ReferenceGraphWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(env, "ReferenceGraph", {
    InstanceMethod("addSymbol", &ReferenceGraphWrapper::AddSymbol),
    InstanceMethod("addSymbols", &ReferenceGraphWrapper::AddSymbols),
    InstanceMethod("hasSymbol", &ReferenceGraphWrapper::HasSymbol),
    InstanceMethod("getSymbol", &ReferenceGraphWrapper::GetSymbol),
    InstanceMethod("getAllSymbols", &ReferenceGraphWrapper::GetAllSymbols),
    InstanceMethod("addReference", &ReferenceGraphWrapper::AddReference),
    InstanceMethod("addReferences", &ReferenceGraphWrapper::AddReferences),
    InstanceMethod("removeReferences", &ReferenceGraphWrapper::RemoveReferences),
    InstanceMethod("findCallers", &ReferenceGraphWrapper::FindCallers),
    InstanceMethod("findCallees", &ReferenceGraphWrapper::FindCallees),
    InstanceMethod("addFile", &ReferenceGraphWrapper::AddFile),
    InstanceMethod("updateFile", &ReferenceGraphWrapper::UpdateFile),
    InstanceMethod("removeFile", &ReferenceGraphWrapper::RemoveFile),
    InstanceMethod("hasFile", &ReferenceGraphWrapper::HasFile),
    InstanceMethod("isSymbolUsed", &ReferenceGraphWrapper::IsSymbolUsed),
    InstanceMethod("findUnusedSymbols", &ReferenceGraphWrapper::FindUnusedSymbols),
    InstanceMethod("findSymbolsByName", &ReferenceGraphWrapper::FindSymbolsByName),
    InstanceMethod("findSymbolsByFile", &ReferenceGraphWrapper::FindSymbolsByFile),
    InstanceMethod("findExportedSymbols", &ReferenceGraphWrapper::FindExportedSymbols),
    InstanceMethod("getStats", &ReferenceGraphWrapper::GetStats),
    InstanceMethod("size", &ReferenceGraphWrapper::Size),
    InstanceMethod("clear", &ReferenceGraphWrapper::Clear),
  });

  Napi::FunctionReference* constructor = new Napi::FunctionReference();
  *constructor = Napi::Persistent(func);
  env.SetInstanceData(constructor);

  exports.Set("ReferenceGraph", func);
  return exports;
}

ReferenceGraphWrapper::ReferenceGraphWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<ReferenceGraphWrapper>(info) {
  graph_ = new prism::ReferenceGraph();
}

ReferenceGraphWrapper::~ReferenceGraphWrapper() {
  delete graph_;
}

// Helpers
prism::Symbol ReferenceGraphWrapper::JsToSymbol(Napi::Object obj) {
  prism::Symbol s;
  if (obj.Has("id")) s.id = obj.Get("id").As<Napi::String>().Utf8Value();
  if (obj.Has("name")) s.name = obj.Get("name").As<Napi::String>().Utf8Value();
  if (obj.Has("type")) s.type = obj.Get("type").As<Napi::String>().Utf8Value();
  if (obj.Has("filePath")) s.filePath = obj.Get("filePath").As<Napi::String>().Utf8Value();
  if (obj.Has("line")) s.line = obj.Get("line").As<Napi::Number>().Int32Value();
  if (obj.Has("column")) s.column = obj.Get("column").As<Napi::Number>().Int32Value();
  if (obj.Has("className")) s.className = obj.Get("className").As<Napi::String>().Utf8Value();
  if (obj.Has("isExported")) s.isExported = obj.Get("isExported").As<Napi::Boolean>().Value();
  if (obj.Has("isStatic")) s.isStatic = obj.Get("isStatic").As<Napi::Boolean>().Value();
  return s;
}

Napi::Object ReferenceGraphWrapper::SymbolToJs(Napi::Env env, const prism::Symbol& s) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("id", s.id);
  obj.Set("name", s.name);
  obj.Set("type", s.type);
  obj.Set("filePath", s.filePath);
  obj.Set("line", s.line);
  obj.Set("column", s.column);
  obj.Set("className", s.className);
  obj.Set("isExported", s.isExported);
  obj.Set("isStatic", s.isStatic);
  return obj;
}

prism::Reference ReferenceGraphWrapper::JsToReference(Napi::Object obj) {
  prism::Reference r;
  if (obj.Has("id")) r.id = obj.Get("id").As<Napi::String>().Utf8Value();
  if (obj.Has("fromSymbolId")) r.fromSymbolId = obj.Get("fromSymbolId").As<Napi::String>().Utf8Value();
  if (obj.Has("toSymbolId")) r.toSymbolId = obj.Get("toSymbolId").As<Napi::String>().Utf8Value();
  if (obj.Has("type")) r.type = obj.Get("type").As<Napi::String>().Utf8Value();
  if (obj.Has("filePath")) r.filePath = obj.Get("filePath").As<Napi::String>().Utf8Value();
  if (obj.Has("line")) r.line = obj.Get("line").As<Napi::Number>().Int32Value();
  if (obj.Has("column")) r.column = obj.Get("column").As<Napi::Number>().Int32Value();
  return r;
}

Napi::Object ReferenceGraphWrapper::ReferenceToJs(Napi::Env env, const prism::Reference& r) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("id", r.id);
  obj.Set("fromSymbolId", r.fromSymbolId);
  obj.Set("toSymbolId", r.toSymbolId);
  obj.Set("type", r.type);
  obj.Set("filePath", r.filePath);
  obj.Set("line", r.line);
  obj.Set("column", r.column);
  return obj;
}

prism::ImportEntry ReferenceGraphWrapper::JsToImportEntry(Napi::Object obj) {
  prism::ImportEntry i;
  if (obj.Has("source")) i.source = obj.Get("source").As<Napi::String>().Utf8Value();
  if (obj.Has("isTypeOnly")) i.isTypeOnly = obj.Get("isTypeOnly").As<Napi::Boolean>().Value();
  if (obj.Has("imported")) {
      Napi::Array arr = obj.Get("imported").As<Napi::Array>();
      for (uint32_t j = 0; j < arr.Length(); j++) {
          i.imported.push_back(arr.Get(j).As<Napi::String>().Utf8Value());
      }
  }
  return i;
}

prism::FileData ReferenceGraphWrapper::JsToFileData(Napi::Object obj) {
  prism::FileData f;
  if (obj.Has("path")) f.path = obj.Get("path").As<Napi::String>().Utf8Value();
  if (obj.Has("symbols")) {
      Napi::Array arr = obj.Get("symbols").As<Napi::Array>();
      for (uint32_t j = 0; j < arr.Length(); j++) {
          f.symbols.push_back(JsToSymbol(arr.Get(j).As<Napi::Object>()));
      }
  }
  if (obj.Has("imports")) {
      Napi::Array arr = obj.Get("imports").As<Napi::Array>();
      for (uint32_t j = 0; j < arr.Length(); j++) {
          f.imports.push_back(JsToImportEntry(arr.Get(j).As<Napi::Object>()));
      }
  }
  return f;
}

// Methods
void ReferenceGraphWrapper::AddSymbol(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Symbol object expected").ThrowAsJavaScriptException();
    return;
  }
  graph_->addSymbol(JsToSymbol(info[0].As<Napi::Object>()));
}

void ReferenceGraphWrapper::AddSymbols(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Array of symbols expected").ThrowAsJavaScriptException();
    return;
  }
  Napi::Array arr = info[0].As<Napi::Array>();
  std::vector<prism::Symbol> symbols;
  for (uint32_t i = 0; i < arr.Length(); i++) {
    symbols.push_back(JsToSymbol(arr.Get(i).As<Napi::Object>()));
  }
  graph_->addSymbols(symbols);
}

Napi::Value ReferenceGraphWrapper::HasSymbol(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Boolean::New(env, graph_->hasSymbol(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value ReferenceGraphWrapper::GetSymbol(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  prism::Symbol s = graph_->getSymbol(info[0].As<Napi::String>().Utf8Value());
  if (s.id.empty()) return env.Null();
  return SymbolToJs(env, s);
}

Napi::Value ReferenceGraphWrapper::GetAllSymbols(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::vector<prism::Symbol> symbols = graph_->getAllSymbols();
  Napi::Array arr = Napi::Array::New(env, symbols.size());
  for (size_t i = 0; i < symbols.size(); i++) {
    arr.Set(i, SymbolToJs(env, symbols[i]));
  }
  return arr;
}

void ReferenceGraphWrapper::AddReference(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Reference object expected").ThrowAsJavaScriptException();
    return;
  }
  graph_->addReference(JsToReference(info[0].As<Napi::Object>()));
}

void ReferenceGraphWrapper::AddReferences(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsArray()) {
    Napi::TypeError::New(env, "Array of references expected").ThrowAsJavaScriptException();
    return;
  }
  Napi::Array arr = info[0].As<Napi::Array>();
  std::vector<prism::Reference> refs;
  for (uint32_t i = 0; i < arr.Length(); i++) {
    refs.push_back(JsToReference(arr.Get(i).As<Napi::Object>()));
  }
  graph_->addReferences(refs);
}

void ReferenceGraphWrapper::RemoveReferences(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
        return;
    }
    graph_->removeReferences(info[0].As<Napi::String>().Utf8Value());
}

Napi::Value ReferenceGraphWrapper::FindCallers(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::vector<prism::Reference> refs = graph_->findCallers(info[0].As<Napi::String>().Utf8Value());
  Napi::Array arr = Napi::Array::New(env, refs.size());
  for (size_t i = 0; i < refs.size(); i++) {
    arr.Set(i, ReferenceToJs(env, refs[i]));
  }
  return arr;
}

Napi::Value ReferenceGraphWrapper::FindCallees(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::vector<prism::Reference> refs = graph_->findCallees(info[0].As<Napi::String>().Utf8Value());
  Napi::Array arr = Napi::Array::New(env, refs.size());
  for (size_t i = 0; i < refs.size(); i++) {
    arr.Set(i, ReferenceToJs(env, refs[i]));
  }
  return arr;
}

void ReferenceGraphWrapper::AddFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "FileData object expected").ThrowAsJavaScriptException();
    return;
  }
  graph_->addFile(JsToFileData(info[0].As<Napi::Object>()));
}

void ReferenceGraphWrapper::UpdateFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "FilePath string and FileData object expected").ThrowAsJavaScriptException();
    return;
  }
  graph_->updateFile(info[0].As<Napi::String>().Utf8Value(), JsToFileData(info[1].As<Napi::Object>()));
}

void ReferenceGraphWrapper::RemoveFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "FilePath string expected").ThrowAsJavaScriptException();
    return;
  }
  graph_->removeFile(info[0].As<Napi::String>().Utf8Value());
}

Napi::Value ReferenceGraphWrapper::HasFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "FilePath string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Boolean::New(env, graph_->hasFile(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value ReferenceGraphWrapper::IsSymbolUsed(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Symbol ID string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  return Napi::Boolean::New(env, graph_->isSymbolUsed(info[0].As<Napi::String>().Utf8Value()));
}

Napi::Value ReferenceGraphWrapper::FindUnusedSymbols(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::vector<prism::Symbol> symbols = graph_->findUnusedSymbols();
  Napi::Array arr = Napi::Array::New(env, symbols.size());
  for (size_t i = 0; i < symbols.size(); i++) {
    arr.Set(i, SymbolToJs(env, symbols[i]));
  }
  return arr;
}

Napi::Value ReferenceGraphWrapper::FindSymbolsByName(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Name string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::vector<prism::Symbol> symbols = graph_->findSymbolsByName(info[0].As<Napi::String>().Utf8Value());
  Napi::Array arr = Napi::Array::New(env, symbols.size());
  for (size_t i = 0; i < symbols.size(); i++) {
    arr.Set(i, SymbolToJs(env, symbols[i]));
  }
  return arr;
}

Napi::Value ReferenceGraphWrapper::FindSymbolsByFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "FilePath string expected").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::vector<prism::Symbol> symbols = graph_->findSymbolsByFile(info[0].As<Napi::String>().Utf8Value());
  Napi::Array arr = Napi::Array::New(env, symbols.size());
  for (size_t i = 0; i < symbols.size(); i++) {
    arr.Set(i, SymbolToJs(env, symbols[i]));
  }
  return arr;
}

Napi::Value ReferenceGraphWrapper::FindExportedSymbols(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  std::vector<prism::Symbol> symbols = graph_->findExportedSymbols();
  Napi::Array arr = Napi::Array::New(env, symbols.size());
  for (size_t i = 0; i < symbols.size(); i++) {
    arr.Set(i, SymbolToJs(env, symbols[i]));
  }
  return arr;
}

Napi::Value ReferenceGraphWrapper::GetStats(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  prism::GraphStats stats = graph_->getStats();
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("totalSymbols", Napi::Number::New(env, stats.totalSymbols));
  obj.Set("totalReferences", Napi::Number::New(env, stats.totalReferences));
  obj.Set("totalFiles", Napi::Number::New(env, stats.totalFiles));
  obj.Set("memoryUsageBytes", Napi::Number::New(env, stats.memoryUsageBytes));
  return obj;
}

Napi::Value ReferenceGraphWrapper::Size(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Number::New(env, graph_->size());
}

void ReferenceGraphWrapper::Clear(const Napi::CallbackInfo& info) {
  graph_->clear();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return ReferenceGraphWrapper::Init(env, exports);
}

NODE_API_MODULE(graph, Init)
