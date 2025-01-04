Crypto tracker + history + compare

```shell
npm install sqlite3 --build-from-source --sqlite_libname=sqlcipher --sqlite=/opt/homebrew/opt/sqlcipher (or linux path)

```

***OSX
``` shell
brew unlink node
brew link --overwrite node@18
xcode-select --install
brew install python-setuptools
brew install node@18
npm install -g node-gyp
npm uninstall sqlite3
npm cache clean --force


export CFLAGS="$CFLAGS -DSQLITE_OMIT_LOAD_EXTENSION"
export CFLAGS="-I/opt/homebrew/Cellar/sqlcipher/4.6.1/include/sqlcipher"
export LDFLAGS="-L/opt/homebrew/Cellar/sqlcipher/4.6.1/lib"
export npm_config_sqlite_libname=sqlcipher
export npm_config_sqlite=/opt/homebrew/Cellar/sqlcipher/4.6.1
export npm_config_build_from_source=true
```


