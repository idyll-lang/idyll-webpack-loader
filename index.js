

// TODO -
//  initialize an idyll instance
//    - write out a string that represents the
//    - parsed version, passing AST into the idyll-document
//       - only include the necessary components


// const {getOptions} = require('loader-utils')

const compile = require('idyll-compiler');
const Idyll = require('idyll');
const { dirname } = require('path');
const { paramCase } = require('change-case');

const {
  getNodesByType,
  getProperty,
  filterNodes,
  getType
} = require('idyll-ast');

const getComponentNodes = ast => {
  const ignoreTypes = new Set(['var', 'data', 'meta', 'derived']);
  let filter = filterNodes(ast, node => {
    if (node.type === 'textnode') {
      return false;
    }
    return !ignoreTypes.has(getType(node).toLowerCase());
  });
  return filter;
};

const getDataNodes = ast => {
  const nodes = getNodesByType(ast, 'data');
  return nodes.map(node => {
    return {
      node,
      name: getProperty(node, 'name'),
      source: getProperty(node, 'source'),
      async: getProperty(node, 'async')
    };
  });
};


const loader = async function (content) {
  const callback = this.async()
  // const options = Object.assign({}, getOptions(this), {
  //   filepath: this.resourcePath
  // });

  const options = {};

  const workingDir = dirname(this.resourcePath);

  const idyll = Idyll({
    inputFile: this.resourcePath,
    output: workingDir + '/build/',
    componentFolder: workingDir + '/components/',
    dataFolder: workingDir + '/data',
    layout: 'centered',
    theme: 'default'
  });

  const resolvers = idyll.getResolvers();
  const { ComponentResolver } = idyll.getResolverConstructors();
  const paths = idyll.getPaths();
  const opts = idyll.getOptions();

  let ast;

  try {
    ast = await compile(content);
  } catch (err) {
    return callback(err);
  }

  resolvers.set('components', new ComponentResolver(opts, paths));

  let nameArray = [];
  getComponentNodes(ast).forEach(node => {
    if (['var', 'derived', 'data'].indexOf(node.type) > -1) {
      nameArray.push(node.type);
    } else {
      // console.log('checking component names - ', node);
      nameArray.push(node.name.split('.')[0]);
    }
  });
  const uniqueComponents = Array.from(new Set(nameArray));
  const components = uniqueComponents.reduce((acc, name) => {
    let resolved = resolvers.get('components').resolve(name);
    if (resolved) acc[paramCase(name)] = resolved;
    return acc;
  }, {});

  const data = getDataNodes(ast).reduce(
    (acc, { name, source, async }) => {
      let { resolvedName, data } = resolvers
        .get('data')
        .resolve(name, source, async);
      acc[resolvedName] = data;
      return acc;
    },
    {}
  );

  const code = `
import React from 'react'
import IdyllDocument from 'idyll-document'

var ast = ${JSON.stringify(ast)};
var components = { ${Object.keys(components).map(k => { return `"${k}": require("${components[k]}")` }).join(', ')} };
var datasets = { ${Object.keys(data).map(k => { return `"${k}": require("${data[k]}")` }).join(', ')} };

var opts = ${JSON.stringify(options)};
var layout = opts.layout;
var theme = opts.theme;

var context = () => {};

export default function() {
  return <IdyllDocument ast={ast} components={components} datasets={datasets} context={context} layout={layout} theme={theme} />;
}`


return callback(null, code)
}

module.exports = loader