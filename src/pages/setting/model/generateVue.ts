// import prettier from 'prettier/esm/standalone.mjs';
// import parserBabel from 'prettier/esm/parser-babel.mjs';
// import parserHTML from 'prettier/esm/parser-html.mjs';
// import parserCSS from 'prettier/esm/parser-postcss.mjs';
// import parserGraphql from 'prettier/esm/parser-graphql.mjs';
import { message } from 'antd';
// import prettier from 'https://unpkg.com/prettier@2.3.0/esm/standalone.mjs';
// import parserBabel from 'https://unpkg.com/prettier@2.3.0/esm/parser-babel.mjs';
// import parserHTML from 'https://unpkg.com/prettier@2.3.0/esm/parser-html.mjs';

import { VueXML, styleXML, VueTableRenderXML } from './componentXML';
import { prettierFormat, transformFunc, replaceObjKey } from '@/utils';
import isFunction from 'lodash/isFunction';

/**
 * element-ui的前缀
 */
const elementUI = 'el-';

let renderData: any = {
  vueCode: '',
  template: '',
  imports: [],
  componentProps: [],
  data: {},
  computed: [],
  methods: [],
  lifecycles: [],
  styles: [],
  apiImports: [],
  apis: [],
};

const lifeCycleMap: any = {
  constructor: 'created',
  getDerivedStateFromProps: 'beforeUpdate',
  componentDidMount: 'mounted',
  componentDidUpdate: 'updated',
  componentWillUnmount: 'beforeDestroy',
};

const allMethodKeys: any = [];

// 通用事件
const commonFunc = [
  'onClick',
  'onChange',
  'onBlur',
  'onFocus',
  'onClear',
  'onSelect',
  'onSearch',
];

const initData = () => {
  renderData = {
    vueCode: '',
    template: '',
    imports: [],
    componentProps: [],
    data: {},
    computed: [],
    methods: [],
    lifecycles: [],
    styles: [],
    apiImports: [],
    apis: [],
  };
};

// 转换componentName成对应的源码名称
const getDomName = (componentType: any, componentName: string) => {
  switch (componentType) {
    case 'native':
      return componentName.toLowerCase();
    case 'custom':
      return componentName;
    default:
      return elementUI + componentName.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
};

const generateTemplate = (schemaDSL: any, vModel?: any) => {
  const {
    componentName,
    props,
    children,
    options,
    dataKey,
    type,
    componentType,
  } = schemaDSL || {};
  let xml = '';
  if (componentName) {
    replaceObjKey(props, 'className', 'class');

    switch (componentName) {
      case 'Form':
        const formDataKey = dataKey || 'form';
        const rulesKey = type === 'search' ? '' : formDataKey + 'Rules';
        // 解决多个form公用数据问题
        renderData.data[formDataKey] = renderData.data[formDataKey]
          ? { ...renderData.data[formDataKey] }
          : {};
        if (rulesKey) {
          renderData.data[rulesKey] = renderData.data[rulesKey]
            ? { ...renderData.data[rulesKey] }
            : {};
        }

        const childs = children || [];
        const buttonItems = (list: any) =>
          list.map((item: any) => {
            if (!item) return '';
            const itemChildren = (item.children || [])
              .map((child: any) => generateTemplate(child))
              .join('');
            return itemChildren;
          });

        const formItems = (list: any[]) =>
          list
            .map((item: any) => {
              const { key, label, initValue } = item || {};
              const vmodel = key && formDataKey ? `${formDataKey}.${key}` : '';
              const itemProps: any = {
                label,
              };
              if (key) {
                itemProps['prop'] = key;
                if (formDataKey) {
                  renderData.data[formDataKey][key] =
                    initValue !== undefined ? initValue : '';
                }
                // 生成rules
                if (rulesKey) {
                  let message = `请输入${label}`;
                  if (item.children && item.children.length) {
                    if (
                      ['Input', 'InputNumber'].includes(
                        item.children[0].componentName,
                      )
                    ) {
                      message = `请输入${label}`;
                    } else {
                      message = `请选择${label}`;
                    }
                  }
                  renderData.data[rulesKey][key] = [
                    { required: true, message },
                  ];
                }
              }
              let itemChildren = (item.children || [])
                .map((child: any) => generateTemplate(child, vmodel))
                .join('');

              itemChildren = VueXML.CreateDom(
                'el-form-item',
                getPropsStr(itemProps),
                itemChildren,
              );
              return VueXML.CreateDom(
                'el-col',
                `v-bind="colProps"`,
                itemChildren,
              );
            })
            .join('\n');

        const formProps = {
          ...props,
          ':model': formDataKey,
        };
        if (rulesKey) {
          formProps[':rules'] = rulesKey;
          formProps['ref'] = formDataKey;
        }
        let buttonItemsStr = !childs[childs.length - 1].key
          ? buttonItems(childs.splice(-1))
          : '';
        let formItemsStr = formItems(childs);
        let formChildStr = null;
        if (type === 'search') {
          // 搜索组件
          // 搜索的处理，添加特定的组件
          buttonItemsStr = VueXML.CreateDom(
            'template',
            `v-slot:doBox`,
            buttonItemsStr,
          );
          formItemsStr = VueXML.CreateDom(
            'template',
            `v-slot:content`,
            formItemsStr,
          );
          formChildStr = VueXML.CreateDom(
            'flex-search',
            '',
            `${formItemsStr}\n${buttonItemsStr}`,
          );
        } else {
          // 普通输入组件
          formChildStr = `${formItemsStr}\n${buttonItemsStr}`;
        }

        formChildStr = VueXML.CreateDom('el-row', `:gutter="20"`, formChildStr);

        xml = VueXML.CreateDom(
          'el-form',
          getPropsStr(formProps),
          `${formChildStr}`,
        );
        break;
      case 'Select':
        const selectOptions = (options || [])
          .map((item: any) => {
            return VueXML.CreateDom('el-option', getPropsStr(item), '');
          })
          .join('\n');
        const selectProps = {
          ...props,
        };
        if (vModel) {
          selectProps['v-model'] = vModel;
        }
        const selectAttr = `${getPropsStr(selectProps)} ${getEventStr(
          schemaDSL,
        )}`;
        xml = VueXML.CreateDom('el-select', selectAttr, `\n${selectOptions}\n`);
        break;
      case 'RangePicker':
        const rangepickerProps: any = {
          type: 'daterange',
          'unlink-panels': true,
          'default-time': ['00:00:00', '23:59:59'],
          'range-separator': '至',
          'start-placeholder': '开始日期',
          'end-placeholder': '结束日期',
          style: 'width: 100%',
          ...props,
        };
        if (vModel) {
          rangepickerProps['v-model'] = vModel;
        }
        const rangePickerAttr = `${getPropsStr(rangepickerProps)} ${getEventStr(
          schemaDSL,
        )}`;
        xml = VueXML.CreateDom('el-date-picker', rangePickerAttr, '');
        break;
      case 'RadioGroup':
        const radioOptions = (options || [])
          .map((item: any) => {
            let name = type === 'button' ? 'el-radio-button' : 'el-radio';
            const itemProps = { ...item };
            // 剔除value
            delete itemProps.value;
            return VueXML.CreateDom(name, getPropsStr(itemProps), '');
          })
          .join('\n');
        const radioGroupProps: any = {
          ...props,
        };
        if (vModel) {
          radioGroupProps['v-model'] = vModel;
        }
        const radioGroupAttr = `${getPropsStr(radioGroupProps)} ${getEventStr(
          schemaDSL,
        )}`;
        xml = VueXML.CreateDom('el-radio-group', radioGroupAttr, radioOptions);
        break;
      case 'Cascader':
        const cascaderProps: any = {
          options: options || [],
          props: { multiple: true },
          'collapse-tags': true,
          ...props,
        };
        if (vModel) {
          const key = vModel.split('.').splice(-1)[0];
          const dataKey1 = key + 'CategoryOptions';
          renderData.data[dataKey1] = options || [];
          delete cascaderProps.options;
          cascaderProps[':options'] = dataKey1;
          cascaderProps['v-model'] = vModel;
        }
        const cascaderAttr = `${getPropsStr(cascaderProps)} ${getEventStr(
          schemaDSL,
        )}`;
        xml = VueXML.CreateDom('el-cascader', cascaderAttr, '');
        break;
      case 'AutoComplete':
        const autoCompleteEventStr = getEventStr(schemaDSL, {
          onSearch: ':fetch-suggestions',
        });
        const autoCompleteProps: any = {
          ...props,
        };
        if (vModel) {
          autoCompleteProps['v-model'] = vModel;
        }
        const autoCompleteAttr = `${getPropsStr(
          autoCompleteProps,
        )} ${autoCompleteEventStr}`;
        xml = VueXML.CreateDom('el-autocomplete', autoCompleteAttr, '');
        break;
      case 'Table':
        const listKey = dataKey || 'list';
        renderData.data[listKey] = [];

        let columns = '';
        if (type === 'editTable') {
          // 添加选择行
          columns += VueXML.CreateDom(
            'el-table-column',
            `type="selection" width="50"`,
            '',
          );
        }
        columns += (children || [])
          .map((item: any) => {
            const newProps = { ...item };
            const renderMothod =
              VueTableRenderXML[item.renderKey] ||
              VueTableRenderXML['renderDefault'];
            let childStr = renderMothod(item.key);

            if (item.key) {
              delete newProps.key;
              delete newProps.renderKey;
            }
            if (item.render) {
              delete newProps.render;
              childStr = item.render;
            }
            if (item.enumObj) {
              renderData.data[`${item.key}Obj`] = item.enumObj;
              delete newProps.enumObj;
            }
            if (Array.isArray(item.children)) {
              // 编辑类型
              delete newProps.children;
              delete newProps.uuid;
              const vmodel = listKey && item.key ? `row.${item.key}` : '';
              childStr = (item.children || [])
                .map((child: any) => generateTemplate(child, vmodel))
                .join('');
            }
            // 重新扫描是否包含函数
            checkFuncStr(childStr);

            childStr = VueXML.CreateDom(
              'template',
              `slot-scope="{ row }"`,
              childStr,
            );
            return VueXML.CreateDom(
              'el-table-column',
              getPropsStr(newProps),
              childStr,
            );
          })
          .join('\n');

        const tableProps = {
          border: true,
          ...props,
          ':data': listKey,
        };
        xml = VueXML.CreateDom(
          'el-table',
          getPropsStr(tableProps),
          `\n${columns}\n`,
        );
        break;
      case 'Row':
        if (dataKey) {
          renderData.data[dataKey] = renderData.data[dataKey]
            ? { ...renderData.data[dataKey] }
            : {};
        }

        const rowChilds = (children || [])
          .filter(Boolean)
          .map((item: any) => {
            if (item.componentName) {
              const vmodel =
                dataKey && item.key ? `${dataKey}.${item.key}` : '';
              return generateTemplate(item, vmodel);
            } else {
              const renderMothod =
                VueTableRenderXML[item.renderKey] ||
                VueTableRenderXML['renderDefault'];
              // let childStr = renderMothod(item.key);
              let childStr = '';

              if (item.key && dataKey) {
                renderData.data[dataKey][item.key] = '';
              }
              if (item.enumObj) {
                renderData.data[`${item.key}Obj`] = item.enumObj;
              }

              if (item.render) {
                childStr = item.render;
              } else {
                childStr = VueXML.CreateDom(
                  'span',
                  'class="title"',
                  `${item.label}：`,
                );
                childStr += '\n';
                childStr += renderMothod(item.key, dataKey);
              }

              // 重新扫描是否包含函数
              checkFuncStr(childStr);

              const colProps = {
                span: item.span ? item.span : 8,
                ...item.props,
              };
              return VueXML.CreateDom(
                'el-col',
                getPropsStr(colProps),
                childStr,
              );
            }
          })
          .join('\n');

        xml = VueXML.CreateDom('el-row', getPropsStr(props), rowChilds);
        break;
      case 'Pagination':
        const paginationDataKey = dataKey || 'pagination';
        renderData.data[paginationDataKey] = {
          currentPage: 1,
          pageSize: 20,
          total: 0,
        };
        const paginationEventStr = getEventStr(schemaDSL, {
          onPageChange: '@current-change',
        });
        const paginationPorps = {
          layout: 'total, prev, pager, next, jumper',
          ...props,
          'v-bind': paginationDataKey,
        };
        const paginationAttr = `${getPropsStr(
          paginationPorps,
        )} ${paginationEventStr}`;
        xml = VueXML.CreateDom('el-pagination', paginationAttr, '');
        break;
      case 'CrumbBack':
        xml = VueXML['CrumbBack'](getEventStr(schemaDSL), children);
        break;
      case 'StatusTag':
        // TODO 这个自定义设计需要改进
        const { statusKey, statusObj } = props;
        const key = statusKey.split('.').splice(-1)[0];
        const dataKey1 = key + 'Obj';
        renderData.data[dataKey1] = statusObj;
        xml = VueXML['StatusTag'](statusKey, dataKey1);
        break;
      default:
        if (dataKey && renderData.data[dataKey] === undefined) {
          renderData.data[dataKey] = '';
        }
        vModel && (props['v-model'] = vModel);
        const defaultAttr = `${getPropsStr(props)} ${getEventStr(schemaDSL)}`;
        const defaultChildStr = Array.isArray(children)
          ? children
              .filter(Boolean)
              .map((t) => {
                if (t.componentName) {
                  return generateTemplate(t);
                } else {
                  return t;
                }
              })
              .join('')
          : children || '';
        const eleName = getDomName(componentType, componentName);
        xml = VueXML.CreateDom(eleName, defaultAttr, defaultChildStr);
        break;
    }
  }

  return xml + '\n';
};

const getLifeCycle = (item: object = {}) => {
  const lifeList: any = [];
  Object.entries(item)
    .filter(Boolean)
    .forEach(([k, v]) => {
      const name = lifeCycleMap[k];
      const { newFunc } = transformFunc(v, name || k);
      lifeList.push(newFunc);
    });
  return lifeList;
};

const getPageProps = (item: object = {}) => {
  const propsList: any = [];
  Object.entries(item)
    .filter(Boolean)
    .forEach(([k, v]) => {
      propsList.push(`${k}: ${v}`);
    });
  return propsList;
};

const getComputed = (item: object = {}) => {
  const computedList: any = [];
  Object.entries(item)
    .filter(Boolean)
    .forEach(([k, v]) => {
      computedList.push(`${k}: ${v}`);
    });
  return computedList;
};

const getImports = (item: object = {}) => {
  const ilist: any = [];
  Object.entries(item).forEach(([k, v]) => {
    const importStr = `import ${k} from "${v}"`;
    ilist.push(importStr);
  });
  return ilist;
};

const getMethods = (item: object = {}) => {
  const mlist: any = [];
  Object.entries(item).forEach(([k, v]) => {
    const { newFunc } = transformFunc(v);
    mlist.push(newFunc);
  });
  return mlist;
};

const getStyles = (type: string) => {
  const slist: any = [];
  const css = styleXML[type]();
  slist.push(css);
  return slist;
};

const getApis = (item: object = {}) => {
  let apiList: any = [];
  let apiImportList: any = [];
  Object.entries(item).forEach(([k, v]) => {
    if (k === 'imports') {
      Object.entries(v).forEach(([kk, vv]) => {
        const importStr = `import ${kk} from "${vv}"`;
        apiImportList.push(importStr);
      });
    } else {
      apiList.push(`export ${v}`);
    }
  });
  return { apiList, apiImportList };
};

const getEventStr = (item: object, extraMap: any = {}) => {
  let funcStr = '';
  Object.entries(item).forEach(([k, v]) => {
    if ((typeof v === 'string' && v.includes('function')) || isFunction(v)) {
      const { newFunc, newFuncName } = transformFunc(v);
      funcStr = funcStr ? `${funcStr} ` : funcStr;
      if (commonFunc.includes(k)) {
        // 通用的函数事件
        const name = k.replace(/on/, '@').toLowerCase();
        funcStr += `${name}="${newFuncName}"`;
      } else if (extraMap[k]) {
        // 特定的函数事件
        funcStr += `${extraMap[k]}="${newFuncName}"`;
      }
      if (!allMethodKeys.includes(newFuncName)) {
        renderData.methods.push(newFunc);
        allMethodKeys.push(newFuncName);
      }
    }
  });
  return funcStr;
};

/**
 * 检测字符串中包含的事件-针对vue【@+事件名】
 * @param str
 */
const checkFuncStr = (str: string) => {
  const funcs = commonFunc
    .map((item) => '@' + item.substr(2).toLowerCase())
    .join('|');
  const reg = new RegExp(`${funcs}`, 'g');
  if (str) {
    const ex = reg.exec(str);
    if (ex) {
      const s = str.substr(ex.index + ex[0].length);
      // console.log('s', s);
      let funcName = s.split(/["']/g)[1];
      let func = funcName;
      if (funcName.endsWith(')')) {
        func += '{ }';
      } else {
        func += '() { }';
      }
      if (!allMethodKeys.includes(funcName)) {
        renderData.methods.push(func);
        allMethodKeys.push(funcName);
      }
      checkFuncStr(s);
    }
  }
};

const getPropsStr = (obj: any) => {
  return Object.entries(obj).reduce((pre, [k, v]) => {
    if (v === undefined || v === null) return pre;
    if (typeof v !== 'string') {
      return `${pre} :${k}="${JSON.stringify(v).replace(/\"/g, "'")}"`;
    } else {
      return `${pre} ${k}="${v}"`;
    }
  }, '');
};

const generateVue = () => {
  const vueCode = VueXML.VueTemplate(renderData);
  return prettierFormat(vueCode, 'vue');
};

const generateApi = () => {
  const apiCode = `
    ${renderData.apiImports.join(';\n')}

    ${renderData.apis.join('\n')}
  `;
  return prettierFormat(apiCode, 'babel');
};

const getSourceCode = (DSL: any) => {
  try {
    initData();
    const { apiList, apiImportList } = getApis(DSL.apis);
    renderData.data = DSL.dataSource || {};
    renderData.componentProps = getPageProps(DSL.componentProps);
    renderData.computed = getComputed(DSL.computed);
    renderData.lifecycles = getLifeCycle(DSL.lifeCycle);
    renderData.methods = getMethods(DSL.methods);
    renderData.imports = getImports(DSL.imports);
    renderData.styles = getStyles(DSL.type);
    renderData.apiImports = apiImportList;
    renderData.apis = apiList;
    renderData.template = generateTemplate(DSL);
    renderData.vueCode = generateVue();
    renderData.apiCode = generateApi();
    return renderData;
  } catch (e) {
    console.error(e);
    message.error('生成源码异常');
  }
};

export { getSourceCode };
