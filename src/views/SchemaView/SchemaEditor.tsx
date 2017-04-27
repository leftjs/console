import * as React from 'react'
import * as cn from 'classnames'
const Codemirror: any = require('react-codemirror')
import * as Relay from 'react-relay'
import {Project} from '../../types/types'
import * as FileSaver from 'file-saver'
import {sortSchema} from '../../../sortSchema'
import {Link} from 'react-router'
import MigrateProject from '../../mutations/Schema/MigrateProject'
import MigrationMessages from './MigrationMessages'
const QueryEditor: any = require('./Editor/QueryEditor').QueryEditor
import {showNotification} from '../../actions/notification'
import {connect} from 'react-redux'
import {ShowNotificationCallback} from '../../types/utils'
import {onFailureShowNotification} from '../../utils/relay'
import Loading from '../../components/Loading/Loading'
require('graphcool-graphiql/graphiql_dark.css')

interface Props {
  project: Project
  relay: any
  forceFetchSchemaView: () => void
  showNotification: ShowNotificationCallback
  onTypesChange: (changed: boolean) => void
  isBeta: boolean
}

export interface MigrationMessage {
  type: string
  action: string
  name: string
  description: string
  subDescriptions: MigrationSubMessage[]
}

export interface MigrationSubMessage {
  type: string
  action: string
  name: string
  description: string
}

export interface MigrationError {
  type: String
  field: String
  description: String
}

interface State {
  schema: string
  beta: boolean
  isDryRun: boolean
  messages: MigrationMessage[]
  errors: MigrationError[]
  loading: boolean
}

class SchemaEditor extends React.Component<Props, State> {
  private lastDidChange = false
  private editor: any
  constructor(props) {
    super(props)
    this.state = {
      // schema: sortSchema(props.project.schema, props.project.models.edges.map(edge => edge.node)),
      schema: props.project.schema,
      beta: props.isBeta,
      isDryRun: true,
      messages: [],
      errors: [],
      loading: false,
    }
    global['s'] = this
  }
  // componentDidMount() {
  //   document.addEventListener('keydown', (e) => {
  //     if (e.keyCode === 27) {
  //       let splitted =  this.state.schema.split('\n')
  //       splitted[14] += ' # @rename(oldName: "oldName")'
  //       const cursor = this.editor.getCursor()
  //       this.setState(
  //         {schema: splitted.join('\n')} as State,
  //         () => {
  //           this.editor.setCursor(cursor)
  //         },
  //       )
  //     }
  //   })
  // }
  componentWillReceiveProps(nextProps) {
    if (nextProps.project.schema !== this.props.project.schema) {
      this.setState({schema: nextProps.project.schema} as State)
    }
  }
  componentDidUpdate() {
    const didChange = this.state.schema.trim() !== this.props.project.schema.trim()
    if (didChange !== this.lastDidChange) {
      this.props.onTypesChange(didChange)
    }
    this.lastDidChange = didChange
  }
  render() {
    const {project} = this.props
    const {schema, beta, isDryRun, loading} = this.state

    const didChange = this.state.schema.trim() !== project.schema.trim()

    return (
      <div className={cn('schema-editor', {beta})}>
        <style jsx={true}>{`
          .schema-editor {
            @p: .w100, .bgDarkerBlue, .flex, .flexColumn, .relative, .h100;
          }
          .schema-editor :global(.CodeMirror) {
            @p: .h100;
            padding: 25px;
            padding-left: 16px;
          }
          .editor-wrapper {
            @p: .flex1, .overflowAuto, .relative;
          }
          .loader {
            @p: .absolute, .top0, .right0, .bottom0, .left0, .flex, .justifyCenter, .itemsCenter;
          }
          .schema-editor:not(.beta) :global(.CodeMirror-cursor) {
            @p: .dn;
          }
          .schema-editor :global(.CodeMirror-selected) {
            background: rgba(255,255,255,.1);
          }

          .footer {
            @p: .flex, .w100, .pa25, .relative, .bgDarkerBlue, .flexFixed;
            /*&:after {
              @p: .absolute, .left0, .right0, .top0;
              z-index: 30;
              margin-top: -36px;
              content: "";
              height: 36px;
              background: linear-gradient(to top, $darkerBlue, rgba(15,32,46,0));
              pointer-events: none;
            }*/
          }
          .footer.editing {
            @p: .bgBlack30, .pa16, .justifyBetween;
          }
          .schema-editor :global(.button) {
            @p: .bgWhite04, .fw6, .f14, .white50, .ttu, .br2, .pointer, .o50, .mr16;
            padding: 7px 9px 8px 11px;
            letter-spacing: 0.53px;
            transition: $duration linear opacity;
          }
          .schema-editor :global(.button:hover) {
            @p: .o100;
          }
          .soon-editable {
            @p: .absolute, .ma25, .top0, .right0, .ttu, .f14, .fw6, .white30;
          }
          .apply-changes {
            @p: .bgGreen, .br2, .white, .f16, .pa10, .pointer;
          }
          .cancel {
            @p: .pa10, .white40, .f16, .pointer;
          }
        `}</style>
        <div className='editor-wrapper'>
          <QueryEditor
            value={schema}
            onEdit={this.handleSchemaChange}
            onRunQuery={this.updateSchema}
            onEditorInstance={instance => {
              this.editor = instance
            }}
            readOnly={!beta}
          />
          {loading && (
            <div className='loader'>
              <Loading color='white' />
            </div>
          )}
        </div>
        {didChange ? (
          <div>
            {(this.state.messages.length > 0 || this.state.errors.length > 0) && (
              <MigrationMessages messages={this.state.messages} errors={this.state.errors} />
            )}
            <div className='footer editing'>
              <div className='cancel' onClick={this.reset}>Cancel</div>
              <div className='apply-changes' onClick={this.updateSchema}>
                {isDryRun ? 'Preview ' : 'Apply '}
                Changes
              </div>
            </div>
          </div>
        ) : (
          <div className='footer'>
            <div className='button' onClick={this.downloadSchema}>Export Schema</div>
            <Link className='button' to={`/${project.name}/clone`}>Clone Project</Link>
          </div>
        )}
        {!beta && (
          <div className='soon-editable'>soon editable</div>
        )}
      </div>
    )
  }

  private updateSchema = () => {
    const {schema, isDryRun} = this.state
    const newSchema = this.addFrontmatter(schema)
    this.setState({loading: true} as State)
    Relay.Store.commitUpdate(
      new MigrateProject({
        newSchema,
        isDryRun,
      }),
      {
        onSuccess: (res) => {
          if (isDryRun) {
            this.setState({
              messages: res.migrateProject.migrationMessages,
              isDryRun: false,
              errors: res.migrateProject.errors,
              loading: false,
            } as State)
          } else {
            this.setState({messages: [], isDryRun: true, errors: [], loading: false} as State)
            this.props.forceFetchSchemaView()
          }
        },
        onFailure: (transaction) => {
          onFailureShowNotification(transaction, this.props.showNotification)
          this.setState({loading: false} as State)
        },
      },
    )
  }

  private reset = () => {
    this.setState({
      errors: [],
      messages: [],
      isDryRun: true,
    } as State)
  }

  private addFrontmatter(schema) {
    const {version, id} = this.props.project
    return `# projectId: ${id}
# version: ${version}\n` + schema
  }

  private patchSchemaRemarks(schema) {
    const splittedOld = this.state.schema.split('\n')
    let splittedNew = schema.split('\n')
    const cursor = this.editor.getCursor()

    const oldLine = splittedOld[cursor.line]
    const newLine = splittedNew[cursor.line]
    const oldFieldName = this.getFieldName(oldLine)
    const newFieldName = this.getFieldName(newLine)
    let changed = false

    if (
      oldLine !== newLine
      && this.isField(oldLine)
      && this.isField(newLine)
      && !oldLine.includes('@rename')
      && !newLine.includes('@rename')
      && oldFieldName !== newFieldName
    ) {
      splittedNew[cursor.line] += ` @rename(oldName: "${oldFieldName}")`
      changed = true
    }
    return {
      schema: splittedNew.join('\n'),
      changed,
      cursor,
    }
  }

  private isField(line) {
    return /.+?:.+/.test(line)
  }

  private getFieldName(line) {
    const res = /(.+?):.*/.exec(line)
    return res ? res[1].trim() : ''
  }

  private handleSchemaChange = newSchema => {
    if (!this.state.beta) {
      return
    }
    const {schema, changed, cursor} = this.patchSchemaRemarks(newSchema)
    this.setState(
      {schema, errors: [], messages: [], isDryRun: true} as State,
      () => {
        if (changed) {
          this.editor.setCursor(cursor)
        }
      },
    )
  }

  private downloadSchema = () => {
    const blob = new Blob([this.props.project.schema], {type: 'text/plain;charset=utf-8'})
    FileSaver.saveAs(blob, `${this.props.project.name}.schema`)
  }
}

const SchemaEditorRedux = connect(null, {showNotification})(SchemaEditor)

export default Relay.createContainer(SchemaEditorRedux, {
  fragments: {
    project: () => Relay.QL`
      fragment on Project {
        id
        schema
        name
        version
        models(first: 100) {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `,
  },
})
