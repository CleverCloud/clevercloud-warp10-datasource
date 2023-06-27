import React, {ChangeEvent, useState} from 'react';
import {ActionMeta, InlineField, Input, Select, Card, TextArea, Button, IconButton} from '@grafana/ui';
import {DataSourcePluginOptionsEditorProps, SelectableValue} from '@grafana/data';
import {ConstProp, MyDataSourceOptions} from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions> {
}

export function ConfigEditor(props: Props) {
    const {onOptionsChange, options} = props;

    //Var new constant
    let [nameConst, setNameConst] = useState("");
    let [valueConst, setValueConst] = useState("");

    //Modification input URL
    const onPathChange = (event: ChangeEvent<HTMLInputElement>) => {
        const jsonData = {
            ...options.jsonData,
            path: event.target.value,
        };
        onOptionsChange({...options, jsonData});
    };

    // Modification select access
    const onAccessChange = (value: SelectableValue<string>, actionMeta: ActionMeta) => {
        const jsonData = {
            ...options.jsonData,
            access: value.value,
        };
        onOptionsChange({...options, jsonData});
    };

    //Modification input name of the new constant
    const onNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setNameConst(event.target.value)
    };

    //Modification input value of the new constant
    const onValueChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setValueConst(event.target.value)
    };

    //Add new constant
    const addConst = () => {
        if (nameConst !== "" && valueConst !== "") {

            const listConst = options.jsonData.const ?? []

            const id = listConst.findIndex(e => e.name === nameConst)

            if (id === -1) {
                const c: ConstProp = {
                    name: nameConst,
                    value: valueConst
                }
                listConst.push(c)
            } else {
                listConst[id].value = valueConst
            }

            const jsonData: MyDataSourceOptions = {
                ...options.jsonData,
                const: listConst
            }
            onOptionsChange({...options, jsonData});

            setNameConst("")
            setValueConst("")
        }
    }

    //Delete constant
    const deleteConst = (name: string) => {
        const listConst = options.jsonData.const
        if (listConst !== undefined) {
            const newListConst = listConst.filter((item) => item.name !== name);
            const jsonData: MyDataSourceOptions = {
                ...options.jsonData,
                const: newListConst
            }
            onOptionsChange({...options, jsonData});
        }
    }

    //Modification constant (modification input name and value with current constant values)
    const modifyConst = (name: string, value: string) => {
        setNameConst(name)
        setValueConst(value)
    }

    //Front
    return (
        <div className="gf-form-group">
            <div>
                <h1>HTTP Address</h1>
                <InlineField label="URL" labelWidth={12} tooltip={"Do not append /api/v0/exec at the end of the URL"}>
                    <Input
                        onChange={onPathChange}
                        width={60}
                        value={options.jsonData.path}
                    />
                </InlineField>
                <InlineField label="Access" labelWidth={12}
                             tooltip={"Direct = url is used directly from browser Proxy = Grafana backend will proxy the request"}>
                    <Select
                        options={[
                            {value: 'direct', label: 'direct'},
                            {value: 'proxy', label: 'proxy'}
                        ]}
                        value={options.jsonData.access}
                        onChange={onAccessChange}
                        width={60}
                        id={"select"}
                    />
                </InlineField>
            </div>
            <div style={{marginTop: "3rem"}}>
                <h1>Constants</h1>
                <Card style={{borderLeft: "solid 3px  #3498db"}}>
                    <Card.Heading>
                        This constants can be used in every templating or query. Register your constant name and value
                        {/* eslint-disable-next-line react/no-unescaped-entities */}
                        and prefix your constant name with "$" in your queries/templating.
                    </Card.Heading>
                    <Card.Description>
                        example: <code>$token</code>
                    </Card.Description>
                </Card>
                <h3 style={{marginTop: "1rem"}}>Add a constant</h3>
                <InlineField label="Name" labelWidth={12}>
                    <Input
                        width={119}
                        onChange={onNameChange}
                        value={nameConst}
                    />
                </InlineField>
                <InlineField label="Value" labelWidth={12}>
                    <TextArea
                        cols={100}
                        onChange={onValueChange}
                        value={valueConst}
                    />
                </InlineField>
                <Button variant="primary" style={{marginLeft: "7.15rem"}} onClick={addConst}>
                    Add
                </Button>
                <h3 style={{marginTop: "1rem"}}>Constant list</h3>
                <Const listConst={options.jsonData.const} deleteConst={deleteConst} modifyConst={modifyConst}/>
            </div>
        </div>
    );
}

//Function display constant list
function Const(props: {
    listConst?: ConstProp[],
    deleteConst: (name: string) => void,
    modifyConst: (name: string, value: string) => void
}) {
    const {listConst, deleteConst, modifyConst} = props

    if (listConst !== undefined) {
        return (
            <table>
                <thead>
                <tr>
                    <td><IconButton name={"trash-alt"} variant={"destructive"} tooltip={"Delete"}
                                    style={{margin: "5px", visibility: "hidden"}}/></td>
                    <td><IconButton name={"pen"} variant={"primary"} tooltip={"Edit"}
                                    style={{margin: "20px", visibility: "hidden"}}/>
                    </td>
                    <th style={{
                        minWidth: "5rem",
                        maxWidth: "15rem",
                        padding: "10px"
                    }}>Name
                    </th>
                    <th>Value</th>
                </tr>
                </thead>
                <tbody>
                {listConst.map(c => <>
                    <tr>
                        <td><IconButton name={"trash-alt"} variant={"destructive"} tooltip={"Delete"}
                                        style={{margin: "5px"}} onClick={() => deleteConst(c.name)}/></td>
                        <td><IconButton name={"pen"} variant={"primary"} tooltip={"Edit"}
                                        style={{margin: "20px"}} onClick={() => modifyConst(c.name, c.value)}/>
                        </td>
                        <td style={{
                            minWidth: "5rem",
                            maxWidth: "15rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            padding: "10px"
                        }}>{c.name}</td>
                        <td style={{maxWidth: "80rem", overflow: "hidden", textOverflow: "ellipsis"}}>{c.value}</td>
                    </tr>
                </>)}
                </tbody>
            </table>
        );
    } else {
        return (
            <></>
        )
    }
}
